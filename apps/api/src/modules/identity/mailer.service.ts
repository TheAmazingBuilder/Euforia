/**
 * Transactional email infrastructure (Phase 2 mandate §46).
 *
 * The mail port supports verification, password reset, email change, and
 * email-based sign-in MFA. Nodemailer delivers through configured SMTP;
 * local development keeps a console transport when credentials are absent.
 * This service handles transactional messages only - no marketing email.
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { ROOT_LOGGER, type RootLogger } from "../../infrastructure/logging/logger.factory";

export type MailKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "EMAIL_CHANGE" | "MFA_EMAIL_CODE";

export interface MailMessage {
  kind: MailKind;
  to: string;
  subject: string;
  actionLabel: string;
  actionUrl: string;
  expiresIn: string;
  /** Present only for email-based sign-in MFA; never persisted or logged in production. */
  code?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/** Real SMTP adapter. The adapter never logs message bodies or action links. */
export class NodemailerMailTransport implements MailTransport {
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(
    private readonly from: string,
    options: { host: string; port: number; secure: boolean; user: string; appPassword: string },
  ) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: { user: options.user, pass: options.appPassword },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      requireTLS: !options.secure,
      tls: { minVersion: "TLSv1.2" },
    });
  }

  async send(message: MailMessage): Promise<void> {
    const safeLabel = escapeHtml(message.actionLabel);
    const safeUrl = escapeHtml(message.actionUrl);
    const safeExpiry = escapeHtml(message.expiresIn);
    const text = message.code
      ? [message.subject, "", `Your sign-in code is: ${message.code}`, "", `This code expires in ${message.expiresIn}.`, "If you did not request this sign-in, secure your account."].join("\n")
      : [message.subject, "", message.actionLabel, message.actionUrl, "", `This link expires in ${message.expiresIn}.`, "If you did not request this message, you can safely ignore it."].join("\n");
    const html = message.code
      ? `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#172033"><h1 style="font-size:20px">Your Euforia sign-in code</h1><p style="font-size:30px;font-weight:700;letter-spacing:6px">${escapeHtml(message.code)}</p><p>This code expires in ${safeExpiry}.</p><p>If you did not request this sign-in, secure your account.</p></body></html>`
      : `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#172033"><h1 style="font-size:20px">${safeLabel}</h1><p>Use the secure link below to continue.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#273a70;color:#fff;text-decoration:none">${safeLabel}</a></p><p>This link expires in ${safeExpiry}.</p><p>If you did not request this message, you can safely ignore it.</p></body></html>`;
    await this.transporter.sendMail({ from: this.from, to: message.to, subject: message.subject, text, html });
  }
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

/** Operational delivery record (Phase 17 telemetry) - NO recipient, NO URL:
 * only the message kind and the outcome, data-minimal by design (§18). */
export interface MailDeliveryRecord {
  id: string;
  at: Date;
  kind: MailKind;
  status: "SENT" | "FAILED";
}

export interface MailDeliveryTelemetry {
  sent: number;
  failed: number;
  /** Latest deliveries first - bounded ring (50). */
  recent: MailDeliveryRecord[];
}

/** Dev/sandbox transport: structured log output - honest and inspectable.
 *
 * SECURITY (finalization §46/§51): the action link embeds a one-time token.
 * In development the link/code is logged for local testing only. Production
 * configuration requires SMTP credentials, so this transport must never be
 * selected there; sensitive message values are redacted as defense in depth.
 */
export class ConsoleMailTransport implements MailTransport {
  private readonly redactActionUrl: boolean;

  constructor(private readonly logger: RootLogger, options?: { redactActionUrl?: boolean }) {
    this.redactActionUrl = options?.redactActionUrl ?? false;
  }

  async send(message: MailMessage): Promise<void> {
    this.logger.info(
      {
        mail: {
          kind: message.kind,
          to: message.to,
          subject: message.subject,
          actionUrl: this.redactActionUrl ? "[REDACTED - configure a real mail transport for production]" : message.actionUrl,
          expiresIn: message.expiresIn,
          code: message.code ? (this.redactActionUrl ? "[REDACTED]" : message.code) : undefined,
        },
      },
      `[mailer] ${message.subject} → ${message.to}`,
    );
  }
}

@Injectable()
export class MailerService {
  private transport: MailTransport;
  /** Phase 17 - bounded operational telemetry (never user content). */
  private readonly deliveries: MailDeliveryRecord[] = [];
  private sentCount = 0;
  private failedCount = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {
    // Never log one-time email tokens in production (§46 - tokens are
    // redacted); the dev transport keeps the link for local testability.
    const smtp = this.config.auth;
    this.transport = smtp.smtpUser && smtp.smtpAppPassword
      ? new NodemailerMailTransport(smtp.emailFrom, {
          host: smtp.smtpHost,
          port: smtp.smtpPort,
          secure: smtp.smtpSecure,
          user: smtp.smtpUser,
          appPassword: smtp.smtpAppPassword,
        })
      : new ConsoleMailTransport(this.logger ?? this.fallbackLogger(), {
          redactActionUrl: this.config.isProduction,
        });
  }

  /** Swap the transport for isolated tests or an alternative provider. */
  useTransport(transport: MailTransport): void {
    this.transport = transport;
  }

  /** Operational delivery telemetry consumed by the Monitoring module (§25). */
  deliveryTelemetry(): MailDeliveryTelemetry {
    return { sent: this.sentCount, failed: this.failedCount, recent: [...this.deliveries].reverse() };
  }

  /** Single delivery funnel: outcome recorded, failures rethrown unchanged. */
  private async deliver(message: MailMessage): Promise<void> {
    try {
      await this.transport.send(message);
      this.sentCount += 1;
      this.pushDelivery(message.kind, "SENT");
    } catch (error) {
      this.failedCount += 1;
      this.pushDelivery(message.kind, "FAILED");
      throw error;
    }
  }

  private pushDelivery(kind: MailKind, status: "SENT" | "FAILED"): void {
    this.deliveries.push({ id: randomUUID(), at: new Date(), kind, status });
    if (this.deliveries.length > 50) {
      this.deliveries.splice(0, this.deliveries.length - 50);
    }
  }

  async sendEmailVerification(to: string, token: string, expiresIn: string): Promise<void> {
    await this.deliver({
      kind: "EMAIL_VERIFICATION",
      to,
      subject: "Verify your Euforia email address",
      actionLabel: "Verify email address",
      actionUrl: `${this.config.auth.webAppUrl}/verify-email?token=${encodeURIComponent(token)}`,
      expiresIn,
    });
  }

  async sendPasswordReset(to: string, token: string, expiresIn: string): Promise<void> {
    await this.deliver({
      kind: "PASSWORD_RESET",
      to,
      subject: "Reset your Euforia password",
      actionLabel: "Choose a new password",
      actionUrl: `${this.config.auth.webAppUrl}/reset-password?token=${encodeURIComponent(token)}`,
      expiresIn,
    });
  }

  async sendEmailMfaCode(to: string, code: string, expiresIn: string): Promise<void> {
    await this.deliver({
      kind: "MFA_EMAIL_CODE",
      to,
      subject: "Your Euforia sign-in code",
      actionLabel: "Your sign-in code",
      actionUrl: "",
      code,
      expiresIn,
    });
  }

  async sendEmailChangeVerification(to: string, token: string, expiresIn: string): Promise<void> {
    await this.deliver({
      kind: "EMAIL_CHANGE",
      to,
      subject: "Confirm your new Euforia email address",
      actionLabel: "Confirm new email address",
      actionUrl: `${this.config.auth.webAppUrl}/verify-email?token=${encodeURIComponent(token)}`,
      expiresIn,
    });
  }

  private fallbackLogger(): RootLogger {
    // Logger may be absent in exotic boot orders - never lose the mail.
    const sink = (obj: object, msg: string) => console.info(msg, JSON.stringify(obj));
    return { info: sink, error: sink, warn: sink, debug: sink } as unknown as RootLogger;
  }
}

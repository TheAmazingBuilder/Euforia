/**
 * Transactional email infrastructure (Phase 2 mandate §46).
 *
 * A MINIMAL port: exactly three message kinds (verification, password reset,
 * email change). The transport is infrastructure behind this service —
 * the sandbox/dev transport renders the email to the structured log
 * (including the action link) so flows are testable end-to-end without a
 * provider; a provider adapter (SMTP/Resend/SES — Phase 0 open question #1)
 * plugs in by implementing MailTransport. No marketing email system.
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import { ROOT_LOGGER, type RootLogger } from "../../infrastructure/logging/logger.factory";

export type MailKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "EMAIL_CHANGE";

export interface MailMessage {
  kind: MailKind;
  to: string;
  subject: string;
  actionLabel: string;
  actionUrl: string;
  expiresIn: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/** Dev/sandbox transport: structured log output — honest and inspectable. */
export class ConsoleMailTransport implements MailTransport {
  constructor(private readonly logger: RootLogger) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.info(
      {
        mail: {
          kind: message.kind,
          to: message.to,
          subject: message.subject,
          actionUrl: message.actionUrl,
          expiresIn: message.expiresIn,
        },
      },
      `[mailer] ${message.subject} → ${message.to}`,
    );
  }
}

@Injectable()
export class MailerService {
  private transport: MailTransport;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {
    this.transport = new ConsoleMailTransport(this.logger ?? this.fallbackLogger());
  }

  /** Swap the transport (production adapter plugs in here). */
  useTransport(transport: MailTransport): void {
    this.transport = transport;
  }

  async sendEmailVerification(to: string, token: string, expiresIn: string): Promise<void> {
    await this.transport.send({
      kind: "EMAIL_VERIFICATION",
      to,
      subject: "Verify your Cosmoz email address",
      actionLabel: "Verify email address",
      actionUrl: `${this.config.auth.webAppUrl}/verify-email?token=${encodeURIComponent(token)}`,
      expiresIn,
    });
  }

  async sendPasswordReset(to: string, token: string, expiresIn: string): Promise<void> {
    await this.transport.send({
      kind: "PASSWORD_RESET",
      to,
      subject: "Reset your Cosmoz password",
      actionLabel: "Choose a new password",
      actionUrl: `${this.config.auth.webAppUrl}/reset-password?token=${encodeURIComponent(token)}`,
      expiresIn,
    });
  }

  async sendEmailChangeVerification(to: string, token: string, expiresIn: string): Promise<void> {
    await this.transport.send({
      kind: "EMAIL_CHANGE",
      to,
      subject: "Confirm your new Cosmoz email address",
      actionLabel: "Confirm new email address",
      actionUrl: `${this.config.auth.webAppUrl}/verify-email?token=${encodeURIComponent(token)}`,
      expiresIn,
    });
  }

  private fallbackLogger(): RootLogger {
    // Logger may be absent in exotic boot orders — never lose the mail.
    const sink = (obj: object, msg: string) => console.info(msg, JSON.stringify(obj));
    return { info: sink, error: sink, warn: sink, debug: sink } as unknown as RootLogger;
  }
}

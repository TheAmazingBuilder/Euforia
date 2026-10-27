import { describe, expect, it, vi } from "vitest";
import { MailerService, type MailMessage } from "../../src/modules/identity/mailer.service";
import type { AppConfig } from "../../src/config/app-config";
import type { RootLogger } from "../../src/infrastructure/logging/logger.factory";

function createMailer() {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as RootLogger;
  const config = {
    isProduction: false,
    auth: {
      emailFrom: "Euforia <mailer@example.com>",
      webAppUrl: "http://localhost:3000",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: undefined,
      smtpAppPassword: undefined,
    },
  } as AppConfig;
  return new MailerService(config, logger);
}

describe("MailerService email MFA", () => {
  it("sends an email OTP through the configured transport and records data-minimal telemetry", async () => {
    const mailer = createMailer();
    const messages: MailMessage[] = [];
    mailer.useTransport({ send: async (message) => { messages.push(message); } });

    await mailer.sendEmailMfaCode("trader@example.com", "042817", "5 minutes");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      kind: "MFA_EMAIL_CODE",
      to: "trader@example.com",
      code: "042817",
      expiresIn: "5 minutes",
    });
    expect(mailer.deliveryTelemetry()).toMatchObject({
      sent: 1,
      failed: 0,
      recent: [{ kind: "MFA_EMAIL_CODE", status: "SENT" }],
    });
    expect(JSON.stringify(mailer.deliveryTelemetry())).not.toContain("042817");
    expect(JSON.stringify(mailer.deliveryTelemetry())).not.toContain("trader@example.com");
  });

  it("records delivery failures and propagates the transport error", async () => {
    const mailer = createMailer();
    mailer.useTransport({ send: async () => { throw new Error("SMTP unavailable"); } });

    await expect(mailer.sendEmailMfaCode("trader@example.com", "042817", "5 minutes"))
      .rejects.toThrow("SMTP unavailable");
    expect(mailer.deliveryTelemetry()).toMatchObject({
      sent: 0,
      failed: 1,
      recent: [{ kind: "MFA_EMAIL_CODE", status: "FAILED" }],
    });
  });
});

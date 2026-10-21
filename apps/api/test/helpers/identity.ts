/**
 * Identity e2e helpers — real AppModule, real database, captured mail.
 */
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { MailerService, type MailMessage } from "../../src/modules/identity/mailer.service";

export interface MailCapture {
  messages: MailMessage[];
  lastVerificationToken(): string;
  lastResetToken(): string;
  clear(): void;
}

/** Swap the mailer transport for a capturing one (DI seam on MailerService). */
export function captureMail(app: NestFastifyApplication): MailCapture {
  const messages: MailMessage[] = [];
  app.get(MailerService).useTransport({
    send: async (message) => {
      messages.push(message);
    },
  });
  const tokenFrom = (url: string) => new URL(url).searchParams.get("token") as string;
  return {
    messages,
    lastVerificationToken() {
      const last = [...messages].reverse().find((m) => m.kind !== "PASSWORD_RESET");
      if (!last) throw new Error("no verification mail captured");
      return tokenFrom(last.actionUrl);
    },
    lastResetToken() {
      const last = [...messages].reverse().find((m) => m.kind === "PASSWORD_RESET");
      if (!last) throw new Error("no reset mail captured");
      return tokenFrom(last.actionUrl);
    },
    clear() {
      messages.length = 0;
    },
  };
}

export function uniqueEmail(prefix = "user"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}@test.cosmoz.dev`;
}

export const PASSWORD = "correct-horse-battery";

export function refreshCookieOf(res: { cookies?: Array<{ name: string; value: string }>; headers: Record<string, unknown> }): string {
  const fastifyCookies = (res as { cookies?: Array<{ name: string; value: string }> }).cookies;
  if (Array.isArray(fastifyCookies)) {
    const cookie = fastifyCookies.find((c) => c.name === "cosmoz_rt");
    if (cookie) return cookie.value;
  }
  const header = res.headers["set-cookie"];
  const raw = Array.isArray(header) ? header.join(";") : String(header ?? "");
  const match = /cosmoz_rt=([^;]+)/.exec(raw);
  if (!match || match[1] === undefined) {
    throw new Error(`no cosmoz_rt cookie in response: ${raw}`);
  }
  return match[1];
}

export function cookieHeader(value: string): Record<string, string> {
  return { cookie: `cosmoz_rt=${value}` };
}

/** Register + verify + login — returns an authenticated context. */
export async function authenticatedUser(
  app: NestFastifyApplication,
  mail: MailCapture,
  overrides: { email?: string; password?: string; remember?: boolean } = {},
): Promise<{
  email: string;
  password: string;
  accessToken: string;
  authHeader: Record<string, string>;
  refreshCookie: string;
  userId: string;
}> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? PASSWORD;

  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Test Trader", email, password },
  });
  if (registered.statusCode !== 201) {
    throw new Error(`register failed: ${registered.statusCode} ${registered.body}`);
  }
  const verificationToken = mail.lastVerificationToken();
  mail.clear();
  const verified = await app.inject({
    method: "POST",
    url: "/api/v1/auth/email/verify",
    payload: { token: verificationToken },
  });
  if (verified.statusCode !== 200) {
    throw new Error(`verify failed: ${verified.statusCode} ${verified.body}`);
  }

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password, remember: overrides.remember ?? true },
  });
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  const body = login.json();
  return {
    email,
    password,
    accessToken: body.accessToken,
    authHeader: { authorization: `Bearer ${body.accessToken}` },
    refreshCookie: refreshCookieOf(login),
    userId: body.user.id,
  };
}

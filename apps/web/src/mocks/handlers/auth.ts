import { http, HttpResponse } from "msw";
import type {
  ForgotPasswordInput,
  LoginInput,
  MfaChallengeInput,
  MfaRecoveryInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "@cosmoz/shared";
import {
  forgotPasswordInputSchema,
  loginInputSchema,
  mfaChallengeInputSchema,
  mfaRecoveryInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  verifyEmailInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { authEngine, type EngineResult } from "@/mocks/auth-engine";
import { endpoint, latency, parseBody, toErrorResponse } from "./utils";

/**
 * Application authentication endpoints (spec §79). The engine owns state and
 * contract fidelity; these handlers translate engine results into HTTP —
 * including the `Set-Cookie` header that carries the rotating refresh token
 * (never the response body) and the `Retry-After` header on rate limits.
 */

/** Engine result → HTTP response, attaching any cookie instruction. */
function respond<T>(result: EngineResult<T>): Response {
  if (!result.ok) {
    const response = HttpResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
    if (result.retryAfterMs !== undefined) {
      response.headers.set(
        "Retry-After",
        Math.ceil(result.retryAfterMs / 1000).toString(),
      );
    }
    return response;
  }
  // T is a JSON-serializable contract body by construction.
  // NOTE: the Set-Cookie header MUST ride on the response-init — MSW
  // captures response cookies from init headers at construction time
  // (HttpResponse decorators) and persists them via document.cookie.
  const response = HttpResponse.json(
    result.value as Parameters<typeof HttpResponse.json>[0],
    {
      status: result.status,
      headers: result.setCookie
        ? ({ "Set-Cookie": result.setCookie } as Record<string, string>)
        : undefined,
    },
  );
  return response;
}

export const authHandlers = [
  /** POST /auth/register — creates a PENDING_VERIFICATION account. */
  http.post(endpoint(apiPaths.authRegister), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<RegisterInput>(
        registerInputSchema,
        await request.json().catch(() => null),
      );
      return respond(authEngine.register(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /auth/login — credentials → AUTHENTICATED | MFA_REQUIRED. */
  http.post(endpoint(apiPaths.authLogin), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<LoginInput>(
        loginInputSchema,
        await request.json().catch(() => null),
      );
      return respond(authEngine.login(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /auth/mfa/challenge — 6-digit authenticator code. */
  http.post(endpoint(apiPaths.authMfaChallenge), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<MfaChallengeInput>(
        mfaChallengeInputSchema,
        await request.json().catch(() => null),
      );
      return respond(authEngine.mfaChallenge(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /auth/mfa/recover — one-time recovery code. */
  http.post(endpoint(apiPaths.authMfaRecover), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<MfaRecoveryInput>(
        mfaRecoveryInputSchema,
        await request.json().catch(() => null),
      );
      return respond(authEngine.mfaRecover(input));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /auth/refresh — cookie-carried rotating refresh token. */
  http.post(endpoint(apiPaths.authRefresh), async ({ request }) => {
    await latency();
    return respond(authEngine.refresh(request.headers.get("cookie")));
  }),

  /** POST /auth/logout — revokes the refresh chain, clears the cookie. */
  http.post(endpoint(apiPaths.authLogout), async ({ request }) => {
    return respond(authEngine.logout(request.headers.get("cookie")));
  }),

  /** GET /auth/me — Bearer access token → current user + session. */
  http.get(endpoint(apiPaths.authMe), async ({ request }) => {
    const auth = authEngine.authenticate(request.headers.get("authorization"));
    if (!auth) {
      return respond({
        ok: false,
        status: 401,
        code: "INVALID_TOKEN",
        message: "Not authenticated.",
      });
    }
    return respond(authEngine.me(auth.user));
  }),

  /** POST /auth/email/verify — one-time verification token. */
  http.post(endpoint(apiPaths.authEmailVerify), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<VerifyEmailInput>(
        verifyEmailInputSchema,
        await request.json().catch(() => null),
      );
      return respond(authEngine.verifyEmail(input.token));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /auth/email/resend — anti-enumeration, rate limited. */
  http.post(endpoint(apiPaths.authEmailResend), async ({ request }) => {
    await latency();
    try {
      const body = (await request.json().catch(() => null)) as
        | { email?: string }
        | null;
      const email = typeof body?.email === "string" ? body.email : "";
      if (!email.includes("@")) {
        return HttpResponse.json(
          { error: "Enter a valid email address.", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      return respond(authEngine.resendVerification(email));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /auth/password/forgot — generic success, rate limited. */
  http.post(endpoint(apiPaths.authPasswordForgot), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<ForgotPasswordInput>(
        forgotPasswordInputSchema,
        await request.json().catch(() => null),
      );
      return respond(authEngine.forgotPassword(input.email));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /auth/password/reset — one-time reset token + new password. */
  http.post(endpoint(apiPaths.authPasswordReset), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<ResetPasswordInput>(
        resetPasswordInputSchema,
        await request.json().catch(() => null),
      );
      return respond(authEngine.resetPassword(input.token, input.password));
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

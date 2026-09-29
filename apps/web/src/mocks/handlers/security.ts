import { http, HttpResponse } from "msw";
import type {
  ApiKeyCreateInput,
  PasswordChangeInput,
  ReauthInput,
  SessionRevokeInput,
  TwoFactorConfirmInput,
} from "@cosmoz/shared";
import {
  apiKeyCreateInputSchema,
  passwordChangeInputSchema,
  reauthInputSchema,
  sessionRevokeInputSchema,
  twoFactorConfirmInputSchema,
} from "@cosmoz/shared";

import { apiPaths } from "@/lib/api/endpoints";
import { securityEngine } from "@/mocks/security-engine";
import { endpoint, latency, parseBody, pathParam, toErrorResponse } from "./utils";

/**
 * Security endpoints (MASTER PROMPT §5–§19). Inputs are Zod-validated, engine
 * results map to HTTP statuses; rate-limit failures carry Retry-After. The
 * overview is the module's single aggregate — every mutation invalidates it.
 */
export const securityHandlers = [
  /** GET /security/overview — one aggregate for the whole center. */
  http.get(endpoint(apiPaths.securityOverview), async () => {
    await latency();
    try {
      return HttpResponse.json(securityEngine.overview());
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/reauth { password } → short-lived single-use token (§13). */
  http.post(endpoint(apiPaths.securityReauth), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<ReauthInput>(
        reauthInputSchema,
        await request.json().catch(() => null),
      );
      const result = securityEngine.reauth(input);
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
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/password { reauthToken, newPassword } (§5, §13). */
  http.post(endpoint(apiPaths.securityPassword), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<PasswordChangeInput>(
        passwordChangeInputSchema,
        await request.json().catch(() => null),
      );
      const result = securityEngine.changePassword(input);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/2fa/enable { reauthToken } → one-time enrollment (§6). */
  http.post(endpoint(apiPaths.securityTwoFactorEnable), async ({ request }) => {
    await latency();
    try {
      const body = await request.json().catch(() => null) as { reauthToken?: string } | null;
      if (body === null || typeof body.reauthToken !== "string") {
        return HttpResponse.json(
          { error: "Re-authentication required — confirm your password first.", code: "INVALID_REAUTH_TOKEN" },
          { status: 401 },
        );
      }
      const result = securityEngine.enableTwoFactor(body.reauthToken);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/2fa/confirm { code } — validates the authenticator challenge. */
  http.post(endpoint(apiPaths.securityTwoFactorConfirm), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<TwoFactorConfirmInput>(
        twoFactorConfirmInputSchema,
        await request.json().catch(() => null),
      );
      const result = securityEngine.confirmTwoFactor(input);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/2fa/disable { reauthToken } (§6, §13). */
  http.post(endpoint(apiPaths.securityTwoFactorDisable), async ({ request }) => {
    await latency();
    try {
      const body = await request.json().catch(() => null) as { reauthToken?: string } | null;
      if (body === null || typeof body.reauthToken !== "string") {
        return HttpResponse.json(
          { error: "Re-authentication required — confirm your password first.", code: "INVALID_REAUTH_TOKEN" },
          { status: 401 },
        );
      }
      const result = securityEngine.disableTwoFactor(body.reauthToken);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/2fa/recovery/regenerate { reauthToken } → codes shown ONCE. */
  http.post(endpoint(apiPaths.securityTwoFactorRecovery), async ({ request }) => {
    await latency();
    try {
      const body = await request.json().catch(() => null) as { reauthToken?: string } | null;
      if (body === null || typeof body.reauthToken !== "string") {
        return HttpResponse.json(
          { error: "Re-authentication required — confirm your password first.", code: "INVALID_REAUTH_TOKEN" },
          { status: 401 },
        );
      }
      const result = securityEngine.regenerateRecoveryCodes(body.reauthToken);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/api-keys { reauthToken, name, scopes, expiresInDays } (§8). */
  http.post(endpoint(apiPaths.securityApiKeys), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<ApiKeyCreateInput>(
        apiKeyCreateInputSchema,
        await request.json().catch(() => null),
      );
      const result = securityEngine.createApiKey(input);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/api-keys/:id/revoke { reauthToken } (§8, §13). */
  http.post(endpoint(apiPaths.securityApiKeyRevoke(":keyId")), async ({ params, request }) => {
    await latency();
    try {
      const keyId = pathParam(params, "keyId");
      const body = await request.json().catch(() => null) as { reauthToken?: string } | null;
      if (body === null || typeof body.reauthToken !== "string") {
        return HttpResponse.json(
          { error: "Re-authentication required — confirm your password first.", code: "INVALID_REAUTH_TOKEN" },
          { status: 401 },
        );
      }
      const result = securityEngine.revokeApiKey(body.reauthToken, keyId);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),

  /** POST /security/sessions/revoke { sessionId? , scope } (§7, §12). */
  http.post(endpoint(apiPaths.securitySessionRevoke), async ({ request }) => {
    await latency();
    try {
      const input = parseBody<SessionRevokeInput>(
        sessionRevokeInputSchema,
        await request.json().catch(() => null),
      );
      const result = securityEngine.revokeSessions(input);
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.message, code: result.code },
          { status: result.status },
        );
      }
      return HttpResponse.json(result.value);
    } catch (error) {
      return toErrorResponse(error);
    }
  }),
];

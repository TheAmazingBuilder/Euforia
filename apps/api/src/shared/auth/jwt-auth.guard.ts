/**
 * Global authentication guard (Identity phase).
 *
 * Every route requires a valid, non-revoked session unless marked @Public().
 * The backend is the AUTHORITATIVE authorization layer (Phase 2 mandate §40):
 * a valid access token must map to an ACTIVE user with an unrevoked,
 * unexpired session - a stolen token from a signed-out session is worthless.
 *
 * Error semantics match the frontend interceptor contract (AppError → filter):
 *   401 { error: "Unauthorized", code: "INVALID_TOKEN", message: "Not authenticated." }
 *   403 { error: "Forbidden", code: "ACCOUNT_SUSPENDED" | "ACCOUNT_DEACTIVATED" }
 */
import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { ForbiddenError, UnauthorizedError } from "../errors/app-error";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { CURRENT_USER, type AuthPrincipal } from "./current-user.decorator";
import { IDENTITY_GUARD_DEPS, type IdentityGuardDeps } from "../../modules/identity/identity-guard-deps";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDENTITY_GUARD_DEPS) private readonly deps: IdentityGuardDeps,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { [CURRENT_USER]?: AuthPrincipal }>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    const token = header.slice("Bearer ".length).trim();

    let payload: { sub: string; sid: string };
    try {
      payload = await this.deps.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }

    const principal = await this.deps.resolvePrincipal(payload.sub, payload.sid);

    if (!principal) {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }
    if (principal.userStatus === "SUSPENDED") {
      throw new ForbiddenError("This account is suspended. Contact support for help.", "ACCOUNT_SUSPENDED");
    }
    if (principal.userStatus === "DEACTIVATED") {
      throw new ForbiddenError("This account is deactivated.", "ACCOUNT_DEACTIVATED");
    }
    if (principal.userStatus !== "ACTIVE") {
      throw new UnauthorizedError("Not authenticated.", "INVALID_TOKEN");
    }

    request[CURRENT_USER] = { userId: payload.sub, sessionId: payload.sid, role: principal.userRole };
    return true;
  }
}


/** Restricts explicitly administrative controllers after global authentication. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { [CURRENT_USER]?: AuthPrincipal }>();
    if (request[CURRENT_USER]?.role !== "ADMIN") {
      throw new ForbiddenError("Administrator access is required.", "ADMIN_REQUIRED");
    }
    return true;
  }
}

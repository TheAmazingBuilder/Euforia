import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

/** The authenticated principal attached by JwtAuthGuard. */
export interface AuthPrincipal {
  /** Authenticated user id (from the access-token subject). */
  userId: string;
  /** Active session id (from the access token) - "current session". */
  sessionId: string;
  /** Persisted role resolved from the active user record on every request. */
  role: string;
}

export const CURRENT_USER = Symbol("CURRENT_USER");

/** Inject the authenticated principal into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ [CURRENT_USER]?: AuthPrincipal }>();
    return request[CURRENT_USER] as AuthPrincipal;
  },
);

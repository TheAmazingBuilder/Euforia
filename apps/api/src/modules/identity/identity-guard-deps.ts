/**
 * Dependency contract consumed by the global JwtAuthGuard (kept in a separate
 * file to avoid a circular import between the guard (shared/auth) and the
 * identity module implementation).
 */
export interface IdentityGuardDeps {
  /** Verify a JWT access token; throws when invalid or expired. */
  verifyAccessToken(token: string): Promise<{ sub: string; sid: string }>;
  /**
   * Resolve a valid principal: the session must exist, be unrevoked and
   * unexpired, and the user must exist. Returns the user status for the
   * guard's account-status gates.
   */
  resolvePrincipal(
    userId: string,
    sessionId: string,
  ): Promise<{ userStatus: string } | null>;
}

export const IDENTITY_GUARD_DEPS = Symbol("IDENTITY_GUARD_DEPS");

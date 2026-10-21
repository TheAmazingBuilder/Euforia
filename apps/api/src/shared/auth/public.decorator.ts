import { SetMetadata } from "@nestjs/common";

/**
 * Marks a route as PUBLIC — the global JwtAuthGuard skips authentication.
 * Usable on classes or handlers: auth endpoints authenticate via
 * credentials, cookies or one-time tokens instead of a bearer token.
 */
export const IS_PUBLIC_KEY = "cosmoz:isPublic";

export function Public(): ClassDecorator & MethodDecorator {
  return SetMetadata(IS_PUBLIC_KEY, true);
}

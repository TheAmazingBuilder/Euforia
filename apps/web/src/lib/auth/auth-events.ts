/**
 * Authentication event bus (spec §57) — a deliberately minimal, typed
 * emitter so the centralized AuthProvider can react to lifecycle changes
 * that happen deep inside the API layer (refresh success, session expiry,
 * forced logout) without any component wiring.
 *
 * NOT an uncontrolled event bus: exactly one consumer exists (AuthProvider)
 * and the event set is closed. Never carry secrets in events (§51, §52).
 */

export type AuthEvent =
  | { type: "AUTHENTICATED" }
  | { type: "LOGGED_OUT" }
  | { type: "SESSION_EXPIRED" }
  | { type: "TOKEN_REFRESHED" }
  | { type: "MFA_REQUIRED" };

type Listener = (event: AuthEvent) => void;

const listeners = new Set<Listener>();

export function emitAuthEvent(event: AuthEvent): void {
  for (const listener of listeners) listener(event);
}

export function subscribeAuthEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

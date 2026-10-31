/**
 * Canonical API-mode check - the single source of truth for "is the mock
 * layer active".
 *
 * HISTORY (task 01 cleanup): the MSW mock/demo layer has been REMOVED from
 * this app. Euforia now runs exclusively on the real NestJS backend (and
 * the real providers behind the Next route handlers). There is no worker
 * left to boot, so mocking can never be activated - by env, by NODE_ENV,
 * or by accident. The constant is kept at a compile-time `false` as an
 * explicit guard against reintroducing an accidental mock path.
 *
 * If a demo/mock mode is ever needed again, reintroduce a real MSW layer
 * and restore the explicit NEXT_PUBLIC_API_MOCKED opt-in here - never an
 * implicit NODE_ENV default (the accidental-mock-activation class the
 * MASTER QA audit targets).
 */
export const API_MOCKED = false;

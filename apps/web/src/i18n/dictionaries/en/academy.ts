/**
 * EN dictionary — ACADEMY namespace (canonical; FR mirrors it exactly
 * through the `Dictionary` type at fr.ts).
 *
 * SCAFFOLD (Task 11): filled by the Academy i18n migration agent. The
 * contract is the established dict.* pattern (see en/session.ts,
 * en/nofy.ts): static strings only — components compose dynamic parts;
 * EN values are verbatim the strings the module rendered before
 * migration. EDUCATIONAL CONTENT served by the API (lesson bodies, quiz
 * questions, glossary entries, course metadata stored in the mock store)
 * is DATA, NOT dict material — only UI chrome is migrated.
 */
export const academyDict = {};

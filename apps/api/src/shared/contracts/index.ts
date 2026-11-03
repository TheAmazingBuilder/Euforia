/**
 * SINGLE SOURCE OF TRUTH for cross-context contracts: re-exports the
 * `@cosmoz/shared` package (Phase 0 §G/§L - the contract layer both the
 * frontend and this backend consume verbatim).
 *
 * WHY A RELATIVE SOURCE PATH: `@cosmoz/shared` is deliberately source-exported
 * (`main → src/index.ts`, no build step) so the frontend transpiles it via
 * Next.js. A bare `import "@cosmoz/shared"` inside the API would type-check
 * but crash at runtime (Node cannot require a .ts file). The api build
 * therefore compiles the shared sources into its own dist (see
 * tsconfig.build.json `include`), and this barrel is the ONLY sanctioned
 * import surface - enforced by eslint `no-restricted-imports`.
 *
 * RULES:
 *   - Bounded contexts import contracts ONLY from this barrel.
 *   - Never add runtime logic here (re-exports only).
 *   - Never re-export Prisma models, Nest classes or server-only config.
 */
export * from "../../../../../packages/shared/src/index";

import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", ".localpg/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // ── Module boundary (Phase 1 architecture rule) ─────────────────────
      // The shared contract package is source-only (main → src/index.ts).
      // A bare "@cosmoz/shared" import would type-check but CRASH at runtime
      // (Node cannot require a .ts file). All contract imports must go
      // through the local barrel: src/shared/contracts.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@cosmoz/shared", "@cosmoz/shared/*"],
              message:
                "Import shared contracts via 'src/shared/contracts' (relative barrel) - '@cosmoz/shared' resolves to TS source at runtime.",
            },
          ],
        },
      ],
    },
  },
);

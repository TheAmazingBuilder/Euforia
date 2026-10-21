/**
 * One-shot auth-component i18n migration:
 *   import authCopy  → import useDict
 *   authCopy.x       → auth.x
 *   each component   → const auth = useDict().auth; (inserted after signature)
 */
const fs = require("fs");
const path = require("path");

const DIR = "/home/z/my-project/apps/web/src/components/auth";
const PLAN = {
  "auth-gate.tsx": [
    "function VerificationRequiredScreen() {",
    "function AccountStatusScreen({ status }: { status: \"SUSPENDED\" | \"DEACTIVATED\" }) {",
    "export function AuthGate({ children }: { children: React.ReactNode }) {",
  ],
  "auth-layout.tsx": null, // insert after first "export function AuthLayout(" line (multi-line signature) — handled specially
  "forgot-password-form.tsx": ["export function ForgotPasswordForm() {"],
  "login-form.tsx": ["export function LoginForm() {"],
  "register-form.tsx": ["export function RegisterForm() {"],
  "reset-password-form.tsx": ["export function ResetPasswordForm() {"],
  "verify-email-view.tsx": ["export function VerifyEmailView() {"],
};

for (const [file, hooks] of Object.entries(PLAN)) {
  const full = path.join(DIR, file);
  let src = fs.readFileSync(full, "utf8");
  if (src.includes("useDict")) {
    console.log(file, "already migrated");
    continue;
  }
  src = src.replace(
    'import { authCopy } from "@/components/auth/auth-copy";',
    'import { useDict } from "@/i18n/i18n-provider";',
  );
  src = src.split("authCopy.").join("auth.");
  if (hooks === null) {
    // AuthLayout: multi-line signature — insert after the `) {` that closes it.
    const marker = src.indexOf("export function AuthLayout(");
    const open = src.indexOf(") {", marker);
    const insertAt = open + ") {".length;
    src = src.slice(0, insertAt) + "\n  const auth = useDict().auth;" + src.slice(insertAt);
  } else {
    for (const signature of hooks) {
      const at = src.indexOf(signature);
      if (at === -1) {
        console.error(file, "SIGNATURE NOT FOUND:", signature);
        process.exit(1);
      }
      const insertAt = at + signature.length;
      src = src.slice(0, insertAt) + "\n  const auth = useDict().auth;" + src.slice(insertAt);
    }
  }
  fs.writeFileSync(full, src);
  console.log(file, "migrated");
}

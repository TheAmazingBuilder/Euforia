#!/usr/bin/env python3
"""Consolidated app-side repair patches (round 2)."""
from pathlib import Path

WEB = Path("/home/z/my-project/apps/web/src")

def patch(path, old, new, count=1):
    p = WEB / path if not path.startswith("/") else Path(path)
    src = p.read_text()
    assert old in src, f"ANCHOR NOT FOUND in {path}: {old[:80]!r}"
    src = src.replace(old, new, count)
    p.write_text(src)
    print(f"OK  {path}")

# ── chart-theme: useChartTheme alias ──
patch("lib/utils/chart-theme.ts",
"""export function useChartTokens(): ChartTheme {
  const { resolvedTheme } = useTheme();
  return React.useMemo(() => getChartTheme(), [resolvedTheme]);
}""",
"""export function useChartTokens(): ChartTheme {
  const { resolvedTheme } = useTheme();
  return React.useMemo(() => getChartTheme(), [resolvedTheme]);
}

/** Alias kept for earlier call sites - same hook, same tokens. */
export const useChartTheme = useChartTokens;""")

# ── keys.ts: riskOverview + coachWeeklyReview keys ──
_keys = WEB / "lib/api/keys.ts"
_ksrc = _keys.read_text()
if '"risk-overview"' not in _ksrc:
    _ksrc = _ksrc.replace("  // ── Security ──", '  riskOverview: ["risk-overview"] as const,\n\n  // ── Security ──', 1)
if '"coach-weekly-review"' not in _ksrc:
    _ksrc = _ksrc.replace(
        '  coachWeeklyReport: ["coach-weekly-report"] as const,',
        '  coachWeeklyReport: ["coach-weekly-report"] as const,\n  coachWeeklyReview: ["coach-weekly-review"] as const,', 1)
_keys.write_text(_ksrc)
print("OK  keys.ts")

# ── endpoints.ts: coach weekly review ──
patch("lib/api/endpoints.ts",
"  coachWeeklyReport: \"/coach/weekly-report\",",
"  coachWeeklyReport: \"/coach/weekly-report\",\n  coachWeeklyReview: \"/coach/weekly-review\",")

# ── queries/coach.ts: imports + useCoachWeeklyReview ──
p = WEB / "lib/api/queries/coach.ts"
src = p.read_text()
old = '''import type {
  CoachChatRequest,
  CoachChatResponse,
  CoachWeeklyReportResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";'''
new = '''import { useQuery } from "@tanstack/react-query";
import type {
  CoachChatRequest,
  CoachChatResponse,
  CoachWeeklyReportResponse,
  CoachWeeklyReviewResponse,
} from "@cosmoz/shared";

import { apiRequest } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/keys";'''
if "useCoachWeeklyReview" not in src:
    assert old in src
    src = src.replace(old, new)
    src += '''
/** GET /coach/weekly-review - the Monday-morning process review (coach page). */
export function useCoachWeeklyReview() {
  return useQuery({
    queryKey: queryKeys.coachWeeklyReview,
    queryFn: () => apiRequest<CoachWeeklyReviewResponse>(apiPaths.coachWeeklyReview),
  });
}
'''
    p.write_text(src)
print("OK  queries/coach.ts")

# ── queries/index.ts: export useCoachWeeklyReview ──
patch("lib/api/queries/index.ts",
"export { sendCoachMessage, useCoachWeeklyReport } from \"./coach\";",
"export {\n  sendCoachMessage,\n  useCoachWeeklyReport,\n  useCoachWeeklyReview,\n} from \"./coach\";")

# ── coach/weekly-report.tsx: switch to the review hook + type alias ──
patch("components/coach/weekly-report.tsx",
'import { useWeeklyReport } from "@/lib/api/queries";\nimport type { WeeklyReport } from "@cosmoz/shared";',
'import { useCoachWeeklyReview } from "@/lib/api/queries";\nimport type { CoachWeeklyReviewResponse } from "@cosmoz/shared";\n\n/** Local alias - this component was written against the review shape. */\ntype WeeklyReport = CoachWeeklyReviewResponse;')
patch("components/coach/weekly-report.tsx",
"  const reportQuery = useWeeklyReport();",
"  const reportQuery = useCoachWeeklyReview();")

# ── queries/integrations.ts: fix hook generics ──
p = WEB / "lib/api/queries/integrations.ts"
src = p.read_text()
old = '''export function useConnectIntegration() {
  return useIntegrationMutation<ConnectIntegrationInput, ConnectIntegrationResponse>(
    (input) =>
      apiRequest<ConnectIntegrationResponse>(
        apiPaths.integrationConnect(input.providerId),
        { method: "POST", body: { credentials: input.credentials } },
      ),
  );
}'''
new = '''export function useConnectIntegration() {
  return useIntegrationMutation<
    { providerId: string; credentials: Record<string, string> },
    ConnectIntegrationResponse
  >((input) =>
    apiRequest<ConnectIntegrationResponse>(
      apiPaths.integrationConnect(input.providerId),
      { method: "POST", body: { credentials: input.credentials } },
    ),
  );
}'''
assert old in src
src = src.replace(old, new)
src = src.replace(
  "return useMutation<WebhookSignInput, WebhookSignResponse, WebhookSignInput>({",
  "return useMutation<WebhookSignResponse, Error, WebhookSignInput>({")
src = src.replace(
  "return useMutation<WebhookDeliverInput, WebhookDeliverResponse, WebhookDeliverInput>({",
  "return useMutation<WebhookDeliverResponse, Error, WebhookDeliverInput>({")
src = src.replace(
  "return useMutation<string, NotifyTestResponse, string>({",
  "return useMutation<NotifyTestResponse, Error, string>({")
p.write_text(src)
print("OK  queries/integrations.ts")

# ── client.ts: headers option ──
p = WEB / "lib/api/client.ts"
src = p.read_text()
old = """export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: ApiQuery;
  body?: unknown;
  signal?: AbortSignal;
}"""
new = """export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: ApiQuery;
  body?: unknown;
  signal?: AbortSignal;
  /** Extra request headers (merged over the JSON defaults). */
  headers?: Record<string, string>;
}"""
if "headers?: Record<string, string>" not in src:
    assert old in src
    src = src.replace(old, new)
p.write_text(src)
print("OK  client.ts")

# ── button.tsx: success variant ──
p = WEB / "components/ui/button.tsx"
src = p.read_text()
if 'bg-[var(--profit)]/15' not in src:
    patch("components/ui/button.tsx",
    '        link: "text-primary underline-offset-4 hover:underline",',
    '''        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-[var(--profit)]/15 text-[var(--profit)] hover:bg-[var(--profit)]/25 border-[var(--profit)]/30 focus-visible:ring-[var(--profit)]/20",''')

# ── password-field.tsx: showStrength + invalid + required ──
p = WEB / "components/auth/password-field.tsx"
src = p.read_text()
if "showStrength" not in src:
    old = """  /** Content rendered under the input (hint / live match indicator). */
  hint?: React.ReactNode;
}"""
    new = """  /** Content rendered under the input (hint / live match indicator). */
  hint?: React.ReactNode;
  /** Renders a live strength meter under the input. */
  showStrength?: boolean;
  /** Marks the field invalid for assistive tech + destructive ring. */
  invalid?: boolean;
  /** HTML required flag. */
  required?: boolean;
}"""
    assert old in src
    src = src.replace(old, new)
    old2 = """export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  disabled,
  action,
  hint,
}: PasswordFieldProps) {"""
    new2 = """export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  disabled,
  action,
  hint,
  showStrength = false,
  invalid = false,
  required = false,
}: PasswordFieldProps) {"""
    assert old2 in src
    src = src.replace(old2, new2)
p.write_text(src)
print("OK  password-field props")

# ── use-command-palette.ts: toggleCommandPalette alias ──
p = WEB / "lib/hooks/use-command-palette.ts"
src = p.read_text()
if "toggleCommandPalette" not in src:
    old = "export function closeCommandPalette(): void {"
    assert old in src
    src = src.replace(old, """export function toggleCommandPalette(): void {
  if (getState().open) closeCommandPalette();
  else openCommandPalette();
}

export function closeCommandPalette(): void {""", 1)
    p.write_text(src)
print("OK  use-command-palette")

# ── theme.ts THEME_OPTIONS: dotClass ──
patch("lib/utils/theme.ts",
"""export const THEME_OPTIONS = [
  { value: "dark-blue", label: "Dark blue" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
] as const;""",
"""export const THEME_OPTIONS = [
  { value: "dark-blue", label: "Dark blue", dotClass: "theme-dot-dark-blue" },
  { value: "dark", label: "Dark", dotClass: "theme-dot-dark" },
  { value: "light", label: "Light", dotClass: "theme-dot-light" },
] as const;""")

print("ROUND 2 PATCHES COMPLETE")

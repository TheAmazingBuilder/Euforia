#!/usr/bin/env python3
"""Round 4 — final compile fixes."""
from pathlib import Path

WEB = Path("/home/z/my-project/apps/web/src")
SHARED = Path("/home/z/my-project/packages/shared/src")

def patch(path, old, new, count=1, base=WEB):
    p = (base / path) if not Path(path).is_absolute() else Path(path)
    src = p.read_text()
    assert old in src, f"ANCHOR NOT FOUND in {path}: {old[:90]!r}"
    src = src.replace(old, new, count)
    p.write_text(src)
    print(f"OK  {path}")

# ══ SHARED ═════════════════════════════════════════════════════════════════
# 1. coach.ts: duplicated primitives import
p = SHARED / "schemas/coach.ts"
src = p.read_text()
lines = src.split("\n")
if lines.count('import { decimalStringSchema } from "./primitives";') > 1:
    first = src.find('import { decimalStringSchema } from "./primitives";\n')
    second = src.find('import { decimalStringSchema } from "./primitives";\n', first + 1)
    src = src[:second] + src[second + len('import { decimalStringSchema } from "./primitives";\n'):]
    p.write_text(src)
    print("OK  coach.ts import dedup")

# 2. market.ts: StrategyChecklistItem goes to strategy.ts; risk currency fix; connect response
p = SHARED / "schemas/strategy.ts"
src = p.read_text()
if "StrategyChecklistItem" not in src:
    src += '''
// ── Pre-trade checklist (Session Live gate) ─────────────────────────────────

/** One checklist row frozen into the judgment gate. */
export const strategyChecklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
});
export type StrategyChecklistItem = z.infer<typeof strategyChecklistItemSchema>;
'''
    p.write_text(src)
    print("OK  strategy.ts checklist")

# 3. risk.ts: currency → currencySchema
p = SHARED / "schemas/risk.ts"
src = p.read_text()
src = src.replace('import { severitySchema } from "../enums";', 'import { currencySchema, severitySchema } from "../enums";')
src = src.replace('  currency: z.string().min(1),\n  balance: decimalStringSchema,', '  currency: currencySchema,\n  balance: decimalStringSchema,')
p.write_text(src)
print("OK  risk.ts currency")

# 4. portfolio.ts: ConnectBrokerResponse + imported/skipped
p = SHARED / "schemas/portfolio.ts"
src = p.read_text()
old = """export const connectBrokerResponseSchema = z.object({
  connection: brokerConnectionRowSchema,
  /** The first pull's batch (rows may be 0 for an empty feed). */
  batch: importBatchSchema.extend({ accountName: z.string().min(1) }).nullable(),
});"""
new = """export const connectBrokerResponseSchema = z.object({
  connection: brokerConnectionRowSchema,
  /** The first pull's batch (rows may be 0 for an empty feed). */
  batch: importBatchSchema.extend({ accountName: z.string().min(1) }).nullable(),
  /** Rows imported / skipped by that first pull (toast copy). */
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
});"""
assert old in src
src = src.replace(old, new)
p.write_text(src)
print("OK  portfolio.ts connect response")

# 5. enums: MAX_DRAWDOWN_PCT rule type
p = SHARED / "enums.ts"
src = p.read_text()
if "MAX_DRAWDOWN_PCT" not in src:
    old = '  "MAX_DAILY_RISK_R",'
    assert old in src
    src = src.replace(old, '  "MAX_DAILY_RISK_R",\n  "MAX_DRAWDOWN_PCT",', 1)
    p.write_text(src)
    print("OK  enums MAX_DRAWDOWN_PCT")

# ══ APP ════════════════════════════════════════════════════════════════════
# 6. chart-theme: dedup alias + chartPalette
p = WEB / "lib/utils/chart-theme.ts"
src = p.read_text()
alias = '''
/** Alias kept for earlier call sites — same hook, same tokens. */
export const useChartTheme = useChartTokens;
'''
while src.count(alias) > 1:
    idx = src.rfind(alias)
    src = src[:idx] + src[idx + len(alias):]
p.write_text(src)
print("OK  chart-theme dedup")

p = WEB / "lib/utils/chart-theme.ts"
src = p.read_text()
old = """  /** Resolved next/font family stacks for canvas text (defined on <body>). */
  monoFont: string;
  headingFont: string;
}"""
new = """  /** Resolved next/font family stacks for canvas text (defined on <body>). */
  monoFont: string;
  headingFont: string;
  /** Ordered series palette (token-derived) for multi-series charts. */
  chartPalette: string[];
}"""
assert old in src
src = src.replace(old, new)
old2 = """    monoFont: `${bodyVar("--font-jetbrains-mono")}, monospace`,
    headingFont: `${bodyVar("--font-schibsted")}, sans-serif`,
  };"""
new2 = """    monoFont: `${bodyVar("--font-jetbrains-mono")}, monospace`,
    headingFont: `${bodyVar("--font-schibsted")}, sans-serif`,
    chartPalette: [
      getThemeToken("--accent"),
      getThemeToken("--profit"),
      getThemeToken("--warning"),
      getThemeToken("--loss"),
      getThemeToken("--text-muted"),
    ],
  };"""
assert old2 in src
src = src.replace(old2, new2)
p.write_text(src)
print("OK  chart-theme palette")

# 7. ui/command.tsx: cn import, Root, Dialog className
p = WEB / "components/ui/command.tsx"
src = p.read_text()
src = src.replace('import { cn } from "cn"', 'import { cn } from "@/lib/utils"')
src = src.replace("React.ComponentProps<typeof CommandPrimitive.Root>", "React.ComponentProps<typeof CommandPrimitive>")
src = src.replace("<CommandPrimitive.Root", "<CommandPrimitive")
src = src.replace("</CommandPrimitive.Root>", "</CommandPrimitive>")
src = src.replace(
  "}: React.ComponentProps<typeof Dialog> & {\n  title?: string\n  description?: string\n}) {",
  "}: Omit<React.ComponentProps<typeof Dialog>, \"title\" | \"description\" | \"className\"> & {\n  title?: string\n  description?: string\n  className?: string\n}) {")
p.write_text(src)
print("OK  ui/command.tsx")

# 8. keys: academyGlossary as function
patch("lib/api/keys.ts",
"  academyGlossary: [\"academy-glossary\"] as const,",
"  academyGlossary: (q: string) => [\"academy-glossary\", q] as const,")

# 9. endpoints: riskOverview + journalDay
patch("lib/api/endpoints.ts",
"  statsWeekly: \"/stats/weekly\",",
"  statsWeekly: \"/stats/weekly\",\n  riskOverview: \"/risk/overview\",\n  journalDay: (date: string) => `/journal/day/${date}`,")

# 10. journal queries: useUpsertJournal
p = WEB / "lib/api/queries/journal.ts"
src = p.read_text()
if "useUpsertJournal" not in src:
    src += '''
/** PUT /journal/day/:date — create-or-update the daily journal entry. */
export function useUpsertJournal(date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JournalUpsertInput) =>
      apiRequest<JournalDayResponse>(apiPaths.journalDay(date), {
        method: "PUT",
        body: input,
      }),
    onSuccess: (day) => {
      queryClient.setQueryData(queryKeys.journalDay(date), day);
      void queryClient.invalidateQueries({ queryKey: queryKeys.journalRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.statsOverview });
    },
  });
}
'''
    src = src.replace('import type {', 'import { useMutation } from "@tanstack/react-query";\nimport type {', 1)
    p.write_text(src)
print("OK  journal queries")

# check journal.ts imports include JournalUpsertInput + JournalDayResponse + apiPaths.journalDay usage
p = WEB / "lib/api/queries/journal.ts"
src = p.read_text()
head = src.split("from \"@cosmoz/shared\"")[0]
for name in ("JournalUpsertInput", "JournalDayResponse"):
    if name not in head:
        src = src.replace('} from "@cosmoz/shared";', f'  {name},\n}} from "@cosmoz/shared";', 1)
p.write_text(src)
print("OK  journal queries imports")

# 11. queries/index: export useUpsertJournal
patch("lib/api/queries/index.ts",
"""export {
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useUpdateJournalEntry,
} from "./journal";""",
"""export {
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useUpdateJournalEntry,
  useUpsertJournal,
} from "./journal";""")

# keys: journalDay
patch("lib/api/keys.ts",
"  journal: (params?: { q?: string; tag?: string; linked?: string; mood?: string; sort?: string }) =>",
"  journalDay: (date: string) => [\"journal-day\", date] as const,\n  journal: (params?: { q?: string; tag?: string; linked?: string; mood?: string; sort?: string }) =>")

# 12. queries/market.ts: ChartCandlesResponse
p = WEB / "lib/api/queries/market.ts"
src = p.read_text()
src = src.replace("apiRequest<CandlesResponse>(apiPaths.marketCandles", "apiRequest<ChartCandlesResponse>(apiPaths.marketCandles")
head = src.split('} from "@cosmoz/shared";')[0]
if "ChartCandlesResponse" not in head:
    src = src.replace('import type {', 'import type {\n  ChartCandlesResponse,', 1)
p.write_text(src)
print("OK  market query response type")

# 13. password-input: required + testId props
p = WEB / "components/auth/password-input.tsx"
src = p.read_text()
print("PasswordInput props anchor:", "ariaDescribedBy" in src)
if "required?: boolean" not in src:
    old = "  ariaDescribedBy?: string | undefined;"
    if old in src:
        src = src.replace(old, old + "\n  required?: boolean;\n  testId?: string;", 1)
        # forward them in the destructuring + input
        p.write_text(src)
        print("OK  password-input props (interface)")
    else:
        print("!! password-input shape differs — patch manually")

print("ROUND 4 PART A COMPLETE")

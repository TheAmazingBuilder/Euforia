/**
 * Settings persistence → contract mapping (Phase 15 §30).
 *
 * Response contracts are ALWAYS the shared userPreferencesSchema shape —
 * the Prisma row (or any persistence detail) never leaks. The read-side
 * timezone mirror is enforced HERE: Profile.timezone (Identity-owned,
 * `User.timezone`) is the ONE source of truth, so the doc's
 * localization.timezone is overridden to the profile value on EVERY read.
 * A stale stored mirror can therefore never disagree with the profile the
 * server uses to compute trading-day keys (§15).
 */
import { DEFAULT_USER_PREFERENCES, userPreferencesSchema, type UserPreferences } from "../../shared/contracts";

/** The mapper only consumes the stored doc — metadata stays in the row. */
export function toPreferences(
  row: { preferences: unknown },
  profileTimezone: string,
): UserPreferences {
  const parsed = userPreferencesSchema.parse(row.preferences);
  return {
    ...parsed,
    localization: { ...parsed.localization, timezone: profileTimezone },
  };
}

/** The profile timezone a doc must be served with (defensive fallback). */
export function resolveProfileTimezone(userTimezone: string | null | undefined): string {
  if (typeof userTimezone === "string" && userTimezone.length > 0) return userTimezone;
  return DEFAULT_USER_PREFERENCES.localization.timezone;
}

import { z } from "zod";
import { isoDateTimeSchema, decimalStringSchema } from "./primitives";

/**
 * Social Trading domain — "the trading floor".
 * Three blocks: the shareable performance card (Partage performances),
 * the period leaderboards (Classements) and the community feed
 * (Communauté). The "me" row of every leaderboard is computed from the
 * REAL journal (closed trades, daily stats) — peers are deterministic
 * mock members so ranks stay stable across reloads while still moving
 * with the user's actual results.
 */

/** Feed post flavors. */
export const socialPostKindSchema = z.enum(["TRADE_SHARE", "MILESTONE", "LESSON"]);
export type SocialPostKind = z.infer<typeof socialPostKindSchema>;

/** Leaderboard windows. */
export const socialPeriodSchema = z.enum(["WEEK", "MONTH", "ALL"]);
export type SocialPeriod = z.infer<typeof socialPeriodSchema>;

export const socialTraderSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  /** Token-driven avatar tint (0-360) — no image uploads in the MVP. */
  avatarHue: z.number().int().min(0).max(360),
  assetFocus: z.string().min(1),
  followers: z.number().int().min(0),
  following: z.boolean(),
});
export type SocialTrader = z.infer<typeof socialTraderSchema>;

export const socialLeaderboardRowSchema = z.object({
  traderId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  avatarHue: z.number().int().min(0).max(360),
  assetFocus: z.string().min(1),
  isMe: z.boolean(),
  /** Whether I follow this member (drives the Follow/Following pill). */
  isFollowing: z.boolean(),
  /** Net P&L over the window, % of starting capital — decimal string. */
  netPnlPct: decimalStringSchema,
  /** Win rate over the window, 0-100 — decimal string. */
  winRate: decimalStringSchema,
  avgR: decimalStringSchema.nullable(),
  disciplineScore: decimalStringSchema.nullable(),
  trades: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
});
export type SocialLeaderboardRow = z.infer<typeof socialLeaderboardRowSchema>;

export const socialPostSchema = z.object({
  id: z.string().min(1),
  traderId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  avatarHue: z.number().int().min(0).max(360),
  kind: socialPostKindSchema,
  text: z.string().min(1),
  /** Whether I follow the author ("me" posts never render the pill). */
  isFollowing: z.boolean(),
  symbol: z.string().nullable(),
  direction: z.enum(["BUY", "SELL"]).nullable(),
  rMultiple: decimalStringSchema.nullable(),
  pnl: decimalStringSchema.nullable(),
  likes: z.number().int().min(0),
  likedByMe: z.boolean(),
  comments: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
});
export type SocialPost = z.infer<typeof socialPostSchema>;

/** The shareable performance card — every number server-computed. */
export const socialMeSchema = z.object({
  handle: z.string().min(1),
  displayName: z.string().min(1),
  /** Private = the card / feed posts are not listed for other members. */
  isPublic: z.boolean(),
  shareUrl: z.string().min(1),
  followers: z.number().int().min(0),
  card: z.object({
    netPnlPct: decimalStringSchema,
    winRate: decimalStringSchema,
    avgR: decimalStringSchema.nullable(),
    disciplineScore: decimalStringSchema.nullable(),
    totalTrades: z.number().int().min(0),
    bestStreak: z.number().int().min(0),
    /** Sampled equity points (numbers on purpose — sparkline only). */
    equitySpark: z.array(z.number()),
    currency: z.string().min(1),
  }),
  publishedAt: isoDateTimeSchema.nullable(),
});
export type SocialMe = z.infer<typeof socialMeSchema>;

export const socialOverviewResponseSchema = z.object({
  period: socialPeriodSchema,
  me: socialMeSchema,
  leaderboard: z.array(socialLeaderboardRowSchema),
  posts: z.array(socialPostSchema),
});
export type SocialOverviewResponse = z.infer<typeof socialOverviewResponseSchema>;

export const updateSocialMeInputSchema = z.object({
  isPublic: z.boolean().optional(),
  handle: z.string().min(2).max(24).optional(),
});
export type UpdateSocialMeInput = z.infer<typeof updateSocialMeInputSchema>;

export const createSocialPostInputSchema = z.object({
  kind: socialPostKindSchema,
  text: z.string().min(1).max(280),
  symbol: z.string().min(1).nullable().optional(),
  direction: z.enum(["BUY", "SELL"]).nullable().optional(),
  rMultiple: decimalStringSchema.nullable().optional(),
  pnl: decimalStringSchema.nullable().optional(),
});
export type CreateSocialPostInput = z.infer<typeof createSocialPostInputSchema>;

export const toggleLikeResponseSchema = z.object({
  id: z.string().min(1),
  likes: z.number().int().min(0),
  likedByMe: z.boolean(),
});
export type ToggleLikeResponse = z.infer<typeof toggleLikeResponseSchema>;

export const toggleFollowResponseSchema = z.object({
  traderId: z.string().min(1),
  following: z.boolean(),
  followers: z.number().int().min(0),
});
export type ToggleFollowResponse = z.infer<typeof toggleFollowResponseSchema>;

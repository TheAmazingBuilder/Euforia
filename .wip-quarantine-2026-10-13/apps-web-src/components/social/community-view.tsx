"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  ArrowDownRight,
  BadgeCheck,
  Copy,
  Flame,
  Heart,
  Link2,
  MessageCircle,
  Globe,
  Lock,
  Send,
  Users,
} from "lucide-react";
import type {
  SocialLeaderboardRow,
  SocialPeriod,
  SocialPost,
  SocialPostKind,
} from "@cosmoz/shared";
import { formatNumber, formatR, formatSignedMoney } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateSocialPost,
  useSocialOverview,
  useToggleSocialFollow,
  useToggleSocialPostLike,
  useUpdateSocialMe,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * THE TRADING FLOOR — Social Trading: the shareable performance card
 * (Partage performances), the period classements (Classements) and the
 * community feed (Communauté). My card + my leaderboard row are computed
 * from the REAL journal by GET /social/overview; peers are deterministic
 * floor members. Layout reuses the .ledger-band hairline grid idiom.
 */

const PERIOD_TABS: Array<{ value: SocialPeriod; label: string }> = [
  { value: "WEEK", label: "Week" },
  { value: "MONTH", label: "Month" },
  { value: "ALL", label: "All-time" },
];

const PERIOD_LABEL: Record<SocialPeriod, string> = {
  WEEK: "7 days",
  MONTH: "30 days",
  ALL: "full history",
};

const KIND_META: Record<SocialPostKind, { label: string; chipClass: string }> = {
  TRADE_SHARE: {
    label: "Trade",
    chipClass: "border-accent/40 text-accent",
  },
  MILESTONE: {
    label: "Milestone",
    chipClass: "border-profit/40 text-profit",
  },
  LESSON: {
    label: "Lesson",
    chipClass: "border-warning/50 text-warning",
  },
};

const nTime = (iso: string, now: number): string => {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

/** Signed percent helper — social stats travel as 0-100 decimal strings. */
const signedPct = (value: string): string => {
  const num = Number(value);
  const sign = num > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}%`;
};

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="ledger-label">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Hue-driven identity dot — dynamic data color (identity, not semantics). */
function Avatar({
  hue,
  label,
  size = "size-8",
}: {
  hue: number;
  label: string;
  size?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold text-white",
        size,
      )}
      style={{ backgroundColor: `hsl(${hue} 42% 44%)` }}
      aria-hidden="true"
    >
      {label.replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}

/** Tiny equity sparkline — one polyline, token stroke, baseline dashed. */
function EquitySpark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const up = points[points.length - 1]! >= points[0]!;
  const stroke = up ? "var(--profit)" : "var(--loss)";
  const areaFill = up
    ? "color-mix(in srgb, var(--profit) 12%, transparent)"
    : "color-mix(in srgb, var(--loss) 12%, transparent)";
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-8 w-full"
      role="img"
      aria-label="Equity sparkline"
    >
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={areaFill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line
        x1="0"
        y1={height - ((points[0]! - min) / range) * (height - 4) - 2}
        x2={width}
        y2={height - ((points[0]! - min) / range) * (height - 4) - 2}
        stroke="var(--border)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function CardStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn("font-mono text-sm font-semibold tabular-nums", tone ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function LeaderboardRow({ row, rank }: { row: SocialLeaderboardRow; rank: number }) {
  const pnl = Number(row.netPnlPct);
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        row.isMe && "bg-accent/5 ring-1 ring-inset ring-accent/30",
        rank > 1 && "border-t border-border/60",
      )}
      data-testid={row.isMe ? "social-leaderboard-me" : undefined}
    >
      <span
        className={cn(
          "w-6 shrink-0 text-center font-mono text-xs tabular-nums",
          rank === 1 ? "font-bold text-warning" : rank <= 3 ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {rank}
      </span>
      <Avatar hue={row.avatarHue} label={row.handle} size="size-7" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {row.handle}
          {row.isMe ? (
            <span className="rounded-sm bg-accent px-1 py-px font-mono text-[9px] font-bold uppercase text-accent-foreground">
              You
            </span>
          ) : null}
        </p>
        <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {row.assetFocus} · {row.trades} trades
        </p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            pnl >= 0 ? "text-profit" : "text-loss",
          )}
        >
          {signedPct(row.netPnlPct)}
        </span>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
          WR {formatNumber(row.winRate, 0)}% · {row.avgR === null ? "—" : formatR(row.avgR)}
        </p>
      </div>
    </li>
  );
}

function PostCard({
  post,
  now,
  onLike,
  onFollow,
  likePending,
  followPending,
}: {
  post: SocialPost;
  now: number;
  onLike: (postId: string) => void;
  onFollow: (traderId: string) => void;
  likePending: boolean;
  followPending: boolean;
}) {
  const kind = KIND_META[post.kind];
  const win = post.pnl !== null && Number(post.pnl) >= 0;
  return (
    <article className="space-y-2 border-b border-border/60 px-3 py-3 last:border-0" data-testid="social-post">
      <header className="flex items-center gap-2.5">
        <Avatar hue={post.avatarHue} label={post.handle} size="size-8" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            {post.handle}
            {post.traderId === "me" ? (
              <BadgeCheck className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
            ) : null}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {post.displayName} · {nTime(post.createdAt, now)}
          </p>
        </div>
        {post.traderId !== "me" ? (
          <Button
            size="xs"
            variant="outline"
            className={cn(
              "shrink-0 font-mono text-[10px] uppercase",
              post.isFollowing && "border-accent/50 text-accent",
            )}
            onClick={() => onFollow(post.traderId)}
            disabled={followPending}
            data-testid={`social-follow-${post.handle}`}
          >
            {post.isFollowing ? "Following" : "Follow"}
          </Button>
        ) : null}
      </header>

      <span className={cn("inline-block rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide", kind.chipClass)}>
        {kind.label}
      </span>

      <p className="text-sm leading-relaxed text-foreground">{post.text}</p>

      {post.symbol !== null || post.rMultiple !== null ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {post.symbol !== null ? (
            <span className="rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
              {post.symbol}
            </span>
          ) : null}
          {post.direction !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold",
                post.direction === "SELL" ? "text-loss" : "text-profit",
              )}
            >
              {post.direction === "SELL" ? (
                <ArrowDownRight className="size-3" aria-hidden="true" />
              ) : (
                <ArrowUpRight className="size-3" aria-hidden="true" />
              )}
              {post.direction}
            </span>
          ) : null}
          {post.rMultiple !== null ? (
            <span
              className={cn(
                "font-mono text-[10px] font-semibold tabular-nums",
                Number(post.rMultiple) >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {formatR(post.rMultiple)}
            </span>
          ) : null}
          {post.pnl !== null ? (
            <span
              className={cn(
                "font-mono text-[10px] font-semibold tabular-nums",
                win ? "text-profit" : "text-loss",
              )}
            >
              {formatSignedMoney(post.pnl, "USD", { digits: 2 })}
            </span>
          ) : null}
        </div>
      ) : null}

      <footer className="flex items-center gap-4 pt-0.5">
        <button
          type="button"
          onClick={() => onLike(post.id)}
          disabled={likePending}
          className={cn(
            "inline-flex items-center gap-1 font-mono text-[11px] tabular-nums transition-colors",
            post.likedByMe ? "text-loss" : "text-muted-foreground hover:text-loss",
          )}
          data-testid={`social-like-${post.id}`}
          aria-pressed={post.likedByMe}
        >
          <Heart className={cn("size-3.5", post.likedByMe && "fill-current")} aria-hidden="true" />
          {post.likes}
        </button>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          <MessageCircle className="size-3.5" aria-hidden="true" />
          {post.comments}
        </span>
      </footer>
    </article>
  );
}

export function CommunityView() {
  const [period, setPeriod] = React.useState<SocialPeriod>("WEEK");
  const overview = useSocialOverview(period);
  const updateMe = useUpdateSocialMe();
  const createPost = useCreateSocialPost();
  const toggleLike = useToggleSocialPostLike();
  const toggleFollow = useToggleSocialFollow();

  const [draftKind, setDraftKind] = React.useState<SocialPostKind>("MILESTONE");
  const [draftText, setDraftText] = React.useState("");
  // Render-time-safe clock (risk-view idiom): captured once, refreshed every minute.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const me = overview.data?.me ?? null;
  const isPublic = me?.isPublic ?? false;

  const copyLink = async () => {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.shareUrl);
      toast.success("Share link copied", { description: me.shareUrl });
    } catch {
      toast.error("Could not copy the link", { description: me.shareUrl });
    }
  };

  const togglePublic = () => {
    const next = !isPublic;
    updateMe.mutate(
      { isPublic: next },
      {
        onSuccess: (card) =>
          toast.success(next ? "Performance card published" : "Performance card set to private", {
            description: next ? `Visible on the floor as ${card.handle}` : "Only you can see the card",
          }),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not update the card")),
      },
    );
  };

  const submitPost = () => {
    const text = draftText.trim();
    if (text.length === 0 || createPost.isPending) return;
    createPost.mutate(
      { kind: draftKind, text },
      {
        onSuccess: () => {
          setDraftText("");
          toast.success("Shared to the floor");
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Could not share the post")),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Community
          </h1>
          <p className="text-sm text-muted-foreground">
            The trading floor — publish your numbers, compare classements and trade
            lessons with the other members.
          </p>
        </div>
        {me ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide",
              isPublic ? "border-profit/40 text-profit" : "border-border text-muted-foreground",
            )}
            data-testid="social-visibility-pill"
          >
            {isPublic ? (
              <Globe className="size-3" aria-hidden="true" />
            ) : (
              <Lock className="size-3" aria-hidden="true" />
            )}
            {isPublic ? "Public" : "Private"}
          </span>
        ) : null}
      </header>

      {overview.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-lg" />
        </div>
      ) : overview.isError ? (
        <div className="rounded-lg border border-loss/40 bg-loss/5 px-4 py-3 text-sm text-foreground">
          Could not load the trading floor —{" "}
          <button
            type="button"
            className="font-medium text-accent underline-offset-4 hover:underline"
            onClick={() => void overview.refetch()}
          >
            retry
          </button>
          .
        </div>
      ) : me && overview.data ? (
        <>
          {/* ── Partage performances — my card + composer ─────────────────── */}
          <Caption>MY PERFORMANCE CARD — {PERIOD_LABEL.ALL.toUpperCase()}</Caption>
          <section className="ledger-band" data-testid="social-share-band">
            <article className="col-span-2 space-y-3 sm:col-span-7">
              <div className="flex items-center gap-3">
                <Avatar hue={215} label={me.handle} size="size-10" />
                <div className="min-w-0">
                  <p className="truncate font-heading text-base font-semibold text-foreground">
                    {me.displayName}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {me.handle} · {me.followers} followers
                  </p>
                </div>
              </div>

              <EquitySpark points={me.card.equitySpark} />

              <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
                <CardStat
                  label="Net P&L"
                  value={signedPct(me.card.netPnlPct)}
                  tone={Number(me.card.netPnlPct) >= 0 ? "text-profit" : "text-loss"}
                />
                <CardStat label="Win rate" value={`${formatNumber(me.card.winRate, 0)}%`} />
                <CardStat
                  label="Avg R"
                  value={me.card.avgR === null ? "—" : formatR(me.card.avgR)}
                />
                <CardStat
                  label="Discipline"
                  value={me.card.disciplineScore === null ? "—" : formatNumber(me.card.disciplineScore, 0)}
                />
                <CardStat label="Trades" value={String(me.card.totalTrades)} />
                <CardStat label="Best streak" value={`${me.card.bestStreak}d`} />
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
                <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    readOnly
                    value={me.shareUrl}
                    aria-label="Shareable performance link"
                    className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-muted-foreground outline-none"
                    data-testid="social-share-url"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void copyLink()}
                    data-testid="social-copy-link"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    Copy
                  </Button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={isPublic}
                      onCheckedChange={togglePublic}
                      disabled={updateMe.isPending}
                      aria-label="Publish my performance card"
                      data-testid="social-public-switch"
                    />
                    {isPublic ? "Public" : "Private"}
                  </label>
                </div>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                {isPublic
                  ? `Published — the floor can see this card at ${me.shareUrl}`
                  : "Private — the card is only visible to you until you publish it."}
              </p>
            </article>

            {/* Composer — share to the feed */}
            <article className="col-span-2 flex flex-col gap-2.5 sm:col-span-5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Send className="size-3.5" aria-hidden="true" />
                Share to the floor
              </p>
              <div className="flex gap-1.5" role="group" aria-label="Post kind">
                {(Object.keys(KIND_META) as SocialPostKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setDraftKind(kind)}
                    aria-pressed={draftKind === kind}
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors",
                      draftKind === kind
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`social-kind-${kind}`}
                  >
                    {KIND_META[kind].label}
                  </button>
                ))}
              </div>
              <Textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value.slice(0, 280))}
                placeholder={
                  draftKind === "MILESTONE"
                    ? "Milestone reached — 30 days without breaking a rule…"
                    : draftKind === "LESSON"
                      ? "Lesson learned today — what the journal taught you…"
                      : "Trade insight — setup, context, outcome…"
                }
                rows={3}
                className="resize-none text-sm"
                data-testid="social-post-text"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {draftText.length}/280
                </span>
                <Button
                  size="sm"
                  variant="success"
                  className="gap-1.5"
                  onClick={submitPost}
                  disabled={draftText.trim().length === 0 || createPost.isPending}
                  data-testid="social-post-submit"
                >
                  <Send className="size-3.5" aria-hidden="true" />
                  {createPost.isPending ? "Sharing…" : "Share"}
                </Button>
              </div>
            </article>
          </section>

          {/* ── Classements + Communauté ──────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Classements */}
            <section className="rounded-lg border border-border bg-surface lg:col-span-7" data-testid="social-leaderboard">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <h2 className="flex items-center gap-1.5 font-heading text-sm font-semibold text-foreground">
                  <Flame className="size-4 text-warning" aria-hidden="true" />
                  Classement — by net P&L %
                </h2>
                <div className="flex gap-1" role="tablist" aria-label="Leaderboard period">
                  {PERIOD_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={period === tab.value}
                      onClick={() => setPeriod(tab.value)}
                      className={cn(
                        "rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
                        period === tab.value
                          ? "bg-accent/10 font-semibold text-accent"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      data-testid={`social-tab-${tab.value.toLowerCase()}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <ol>
                {overview.data.leaderboard.map((row, index) => (
                  <LeaderboardRow key={row.traderId} row={row} rank={index + 1} />
                ))}
              </ol>
              <p className="border-t border-border px-3 py-2 font-mono text-[10px] text-muted-foreground">
                Ranked on net P&L % of starting capital over {PERIOD_LABEL[period].toLowerCase()} —
                your row is your REAL journal.
              </p>
            </section>

            {/* Communauté — the feed */}
            <section className="rounded-lg border border-border bg-surface lg:col-span-5" data-testid="social-feed">
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <h2 className="flex items-center gap-1.5 font-heading text-sm font-semibold text-foreground">
                  <Users className="size-4 text-accent" aria-hidden="true" />
                  The floor
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {overview.data.posts.length} posts
                </span>
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {overview.data.posts.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Nothing shared yet — be the first to post.
                  </p>
                ) : (
                  overview.data.posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      now={now}
                      onLike={(postId) => toggleLike.mutate(postId)}
                      onFollow={(traderId) => toggleFollow.mutate(traderId)}
                      likePending={toggleLike.isPending && toggleLike.variables === post.id}
                      followPending={toggleFollow.isPending}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Ghost,
  GraduationCap,
  ImagePlus,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Sprout,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useTheme } from "next-themes";
import { formatPercent, formatSignedMoney } from "@cosmoz/shared";
import type { Currency, Profile as ProfileData } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useProfile, useStatsOverview, useAcademyOverview, useUpdateProfile } from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
] as const;

const THEME_CHOICES = [
  { value: "dark-blue", label: "Dark blue", hint: "Default night ocean" },
  { value: "dark", label: "Dark", hint: "Pure black" },
  { value: "light", label: "Light", hint: "Daylight paper" },
] as const;

/** Max avatar payload — the schema caps avatarUrl at ~600 KB. */
const AVATAR_MAX_BYTES = 450_000;

type Achievement = {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  unlocked: boolean;
  progress?: number; // 0–1, drives the mini progress bar on locked badges.
};

/**
 * /profile — the trader's identity hub: hero band (avatar + handle + bio),
 * live performance snapshot, achievements, direct-edit identity form and
 * the theme picker. Every field saves through PATCH /me on demand.
 */
export function ProfileView() {
  const { data, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const stats = useStatsOverview();
  const academy = useAcademyOverview();
  const { theme, setTheme } = useTheme();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [timezone, setTimezone] = React.useState<string>(TIMEZONES[0]);

  // Hydrate the editable fields when the profile query lands — the documented
  // "adjust state during render" pattern (no setState inside an effect).
  const [hydratedFrom, setHydratedFrom] = React.useState<ProfileData | null>(null);
  if (data !== undefined && data !== hydratedFrom) {
    setHydratedFrom(data);
    setName(data.name);
    setEmail(data.email);
    setUsername(data.username ?? "");
    setBio(data.bio ?? "");
    setTimezone(data.timezone);
  }

  const dirty =
    data !== undefined &&
    (name !== data.name ||
      email !== data.email ||
      username !== (data.username ?? "") ||
      bio !== (data.bio ?? "") ||
      timezone !== data.timezone);

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    const patch: Partial<ProfileData> = {};
    if (data && name !== data.name) patch.name = name;
    if (data && email !== data.email) patch.email = email;
    if (data && username !== (data.username ?? "")) patch.username = username === "" ? null : username;
    if (data && bio !== (data.bio ?? "")) patch.bio = bio === "" ? null : bio;
    if (data && timezone !== data.timezone) patch.timezone = timezone;
    if (Object.keys(patch).length === 0) return;
    updateProfile.mutate(patch, {
      onSuccess: () => toast.success("Profile saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save profile")),
    });
  };

  // ── Avatar upload (data URL → PATCH /me, same pipeline as mocks) ─────────
  const fileRef = React.useRef<HTMLInputElement>(null);
  const onPickAvatar = () => fileRef.current?.click();
  const onAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Image too large — pick one under 450 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl) return;
      updateProfile.mutate(
        { avatarUrl: dataUrl },
        {
          onSuccess: () => toast.success("Photo updated"),
          onError: (error) => toast.error(apiErrorMessage(error, "Could not update photo")),
        },
      );
    };
    reader.readAsDataURL(file);
  };
  const onRemoveAvatar = () => {
    updateProfile.mutate(
      { avatarUrl: null },
      {
        onSuccess: () => toast.success("Photo removed"),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not remove photo")),
      },
    );
  };

  // ── Derived: performance snapshot + achievements ─────────────────────────
  const overview = stats.data;
  const currency = (overview?.currency ?? "USD") as Currency;
  const winRate = overview ? Number(overview.winRate) : null;
  const profitFactor = overview?.profitFactor !== null && overview?.profitFactor !== undefined ? Number(overview.profitFactor) : null;
  const discipline = overview?.disciplineScore !== null && overview?.disciplineScore !== undefined ? Number(overview.disciplineScore) : null;
  const ghostsSaved = overview?.disciplineSaved?.settledCount ?? 0;
  const academyPercent = academy.data ? academy.data.progress.overall.percent / 100 : null;

  const achievements: Achievement[] = [
    {
      id: "first-trade",
      label: "First Steps",
      hint: "Journal your first trade",
      icon: Sprout,
      unlocked: overview !== undefined,
    },
    {
      id: "sharp-shooter",
      label: "Sharp Shooter",
      hint: "Win rate at 55% or higher",
      icon: Target,
      unlocked: winRate !== null && winRate >= 0.55,
      progress: winRate === null ? 0 : Math.min(1, winRate / 0.55),
    },
    {
      id: "profit-architect",
      label: "Profit Architect",
      hint: "Profit factor at 1.5 or higher",
      icon: TrendingUp,
      unlocked: profitFactor !== null && profitFactor >= 1.5,
      progress: profitFactor === null ? 0 : Math.min(1, profitFactor / 1.5),
    },
    {
      id: "iron-discipline",
      label: "Iron Discipline",
      hint: "Discipline score at 80 or higher",
      icon: ShieldCheck,
      unlocked: discipline !== null && discipline >= 80,
      progress: discipline === null ? 0 : Math.min(1, discipline / 80),
    },
    {
      id: "ghost-slayer",
      label: "Ghost Slayer",
      hint: "5 ghost trades skipped by discipline",
      icon: Ghost,
      unlocked: ghostsSaved >= 5,
      progress: Math.min(1, ghostsSaved / 5),
    },
    {
      id: "scholar",
      label: "Scholar",
      hint: "40% of the Academy curriculum",
      icon: GraduationCap,
      unlocked: academyPercent !== null && academyPercent >= 0.4,
      progress: academyPercent === null ? 0 : Math.min(1, academyPercent / 0.4),
    },
  ];
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6" data-testid="profile-view">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your trading identity, live results and achievements — edited directly, saved on demand.
        </p>
      </header>

      {/* ── Hero identity band ─────────────────────────────────────────────── */}
      <Card className="overflow-hidden bg-surface" data-testid="profile-card">
        <div className="h-1 bg-gradient-to-r from-accent/70 via-accent/30 to-transparent" aria-hidden="true" />
        <CardContent className="flex flex-col gap-5 pt-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div
                className="grid size-24 place-items-center overflow-hidden rounded-2xl font-heading text-2xl font-bold text-white shadow-md ring-2 ring-border"
                style={
                  data.avatarUrl
                    ? undefined
                    : { background: "linear-gradient(135deg, hsl(215 62% 46%), hsl(263 62% 38%))" }
                }
                data-testid="profile-avatar"
              >
                {data.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL from the profile, no optimization pipeline
                  <img src={data.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  (data.name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?")
                )}
              </div>
              <button
                type="button"
                onClick={onPickAvatar}
                aria-label="Change photo"
                title="Change photo"
                data-testid="profile-avatar-change"
                className="absolute -bottom-1.5 -right-1.5 grid size-8 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-accent hover:text-accent"
              >
                <ImagePlus className="size-4" aria-hidden="true" />
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
            {data.avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={onRemoveAvatar}
                data-testid="profile-avatar-remove"
              >
                <Trash2 className="size-3" aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-heading text-xl font-bold tracking-tight sm:text-2xl" data-testid="profile-hero-name">
                {data.name}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                <BadgeCheck className="size-3" aria-hidden="true" />
                Verified journal
              </span>
            </div>
            {data.username ? (
              <p className="mt-0.5 text-sm text-muted-foreground" data-testid="profile-hero-username">
                @{data.username}
              </p>
            ) : null}
            <p className="mt-2 max-w-prose text-sm text-foreground/90" data-testid="profile-hero-bio">
              {data.bio || "No bio yet — add a few lines about your trading focus below."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-muted-foreground">
                <Wallet className="size-3.5 text-accent" aria-hidden="true" />
                Base currency <span className="font-mono font-semibold text-foreground">{data.baseCurrency}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-muted-foreground">
                Trading days follow <span className="font-mono font-semibold text-foreground">{data.timezone}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Performance snapshot ───────────────────────────────────────────── */}
      <section aria-label="Performance snapshot" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Performance snapshot</h2>
        {overview ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="profile-stats">
            <div className="rounded-xl border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Net P&L</p>
              <p
                className={cn(
                  "mt-1 font-mono text-lg font-bold tabular-nums",
                  Number(overview.netPnl) >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {formatSignedMoney(overview.netPnl, currency)}
              </p>
            </div>
            <div className="rounded-xl border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Win rate</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{formatPercent(overview.winRate)}</p>
            </div>
            <div className="rounded-xl border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Profit factor</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{overview.profitFactor ?? "—"}</p>
            </div>
            <div className="rounded-xl border bg-surface p-4">
              <p className="text-xs text-muted-foreground">Discipline</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{overview.disciplineScore ?? "—"}</p>
            </div>
          </div>
        ) : (
          <Skeleton className="h-20 rounded-xl" />
        )}
      </section>

      {/* ── Achievements ───────────────────────────────────────────────────── */}
      <section aria-label="Achievements" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Achievements</h2>
          <span className="text-xs text-muted-foreground" data-testid="profile-achievements-count">
            {unlockedCount}/{achievements.length} unlocked
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="profile-achievements">
          {achievements.map((achievement) => {
            const Icon = achievement.icon;
            return (
              <div
                key={achievement.id}
                title={achievement.hint}
                data-testid={`profile-badge-${achievement.id}`}
                data-unlocked={achievement.unlocked ? "true" : "false"}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors",
                  achievement.unlocked
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-surface text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full",
                    achievement.unlocked ? "bg-accent/20" : "bg-muted/40",
                  )}
                >
                  {achievement.unlocked ? (
                    <Icon className="size-4.5" aria-hidden="true" />
                  ) : (
                    <Lock className="size-3.5" aria-hidden="true" />
                  )}
                </span>
                <span className={cn("text-xs font-semibold leading-tight", achievement.unlocked && "text-foreground")}>
                  {achievement.label}
                </span>
                {achievement.unlocked ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : (
                  <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-accent/50"
                      style={{ width: `${Math.round((achievement.progress ?? 0) * 100)}%` }}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Identity form ──────────────────────────────────────────────────── */}
      <Card className="bg-surface">
        <CardHeader className="gap-3">
          <CardTitle className="font-heading text-lg font-semibold">Identity</CardTitle>
          <CardDescription>
            Fields are live inputs — &ldquo;Save changes&rdquo; persists everything at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="grid gap-4" data-testid="profile-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  data-testid="profile-name"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  data-testid="profile-email"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-username">Username</Label>
                <Input
                  id="profile-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  data-testid="profile-username"
                  placeholder="e.g. disciplinedfox"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">3–30 characters — letters, digits, &ldquo;-&rdquo; and &ldquo;_&rdquo; only.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="profile-timezone">Timezone</Label>
                <select
                  id="profile-timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  data-testid="profile-timezone"
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Drives your local trading days — when a &ldquo;day&rdquo; starts and ends.
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="profile-bio">Bio</Label>
              <Textarea
                id="profile-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                data-testid="profile-bio"
                placeholder="A few lines about your trading focus, style or current goal…"
                rows={3}
                maxLength={280}
              />
              <p className="text-xs text-muted-foreground">{bio.length}/280</p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button
                type="submit"
                disabled={!dirty || updateProfile.isPending}
                data-testid="profile-save"
              >
                {updateProfile.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Appearance + quick links ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-surface">
          <CardHeader className="gap-2">
            <CardTitle className="font-heading text-lg font-semibold">Appearance</CardTitle>
            <CardDescription>The whole app follows your choice instantly.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
              {THEME_CHOICES.map((choice) => {
                const active = (theme ?? "dark-blue") === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`profile-theme-${choice.value}`}
                    onClick={() => setTheme(choice.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-background text-foreground hover:border-accent/50",
                    )}
                  >
                    <span className="flex-1">
                      <span className="block font-medium">{choice.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{choice.hint}</span>
                    </span>
                    {active ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface">
          <CardHeader className="gap-2">
            <CardTitle className="font-heading text-lg font-semibold">Account shortcuts</CardTitle>
            <CardDescription>Security, preferences and data — one tap away.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link
              href="/security"
              data-testid="profile-link-security"
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:border-accent/50"
            >
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              <span className="flex-1 font-medium">Security center</span>
              <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
            <Link
              href="/settings"
              data-testid="profile-link-settings"
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:border-accent/50"
            >
              <Wallet className="size-4 text-accent" aria-hidden="true" />
              <span className="flex-1 font-medium">Settings &amp; preferences</span>
              <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Camera,
  CalendarDays,
  Download,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Profile as ProfileData } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useProfile, useRevokeSessions, useSecurityOverview, useUpdateProfile } from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * /profile - the identity hub, faithful to the product reference: identity
 * header card (avatar + camera, name + plan badge, job title, contact meta,
 * Edit Profile), then a 4-tab bar - Personal (2-column identity form),
 * Account (status, plan, visibility, export + danger zone), Security (real
 * security-overview rows: password age, 2FA, login alerts, live sessions)
 * and Notifications (channel preferences). API-backed fields save through
 * PATCH /me; the reference's extra fields and preference toggles persist
 * locally (same local-by-design contract as Tasky/Events).
 */

/* ── Local documents (extras + preferences) ────────────────────────────── */

type ProfileExtras = {
  phone: string;
  jobTitle: string;
  company: string;
  location: string;
  joinedAt: string; // ISO date - rendered "Joined March 2023".
};

type ProfilePrefs = {
  accountVisibility: boolean;
  loginNotifications: boolean;
  notifications: { email: boolean; push: boolean; marketing: boolean; weekly: boolean };
};

const EXTRAS_KEY = "cosmoz.profile.extras.v1";
const PREFS_KEY = "cosmoz.profile.prefs.v1";

const EXTRAS_SEED: ProfileExtras = {
  phone: "+1 (555) 123-4567",
  jobTitle: "Senior Product Designer",
  company: "Acme Inc.",
  location: "San Francisco, CA",
  joinedAt: "2023-03-01",
};

const PREFS_SEED: ProfilePrefs = {
  accountVisibility: true,
  loginNotifications: false,
  notifications: { email: true, push: false, marketing: true, weekly: true },
};

function loadExtras(): ProfileExtras {
  if (typeof window === "undefined") return EXTRAS_SEED;
  try {
    const raw = window.localStorage.getItem(EXTRAS_KEY);
    if (raw) return { ...EXTRAS_SEED, ...(JSON.parse(raw) as Partial<ProfileExtras>) };
  } catch {
    // Corrupted snapshot - fall through to the seed.
  }
  return EXTRAS_SEED;
}

function loadPrefs(): ProfilePrefs {
  if (typeof window === "undefined") return PREFS_SEED;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProfilePrefs>;
      return { ...PREFS_SEED, ...parsed, notifications: { ...PREFS_SEED.notifications, ...parsed.notifications } };
    }
  } catch {
    // Corrupted snapshot - fall through to the seed.
  }
  return PREFS_SEED;
}

/* ── Small helpers ─────────────────────────────────────────────────────── */

function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim();
  const cut = trimmed.indexOf(" ");
  if (cut === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, cut), last: trimmed.slice(cut + 1) };
}

function joinName(first: string, last: string): string {
  return `${first.trim()} ${last.trim()}`.trim();
}

/** Same relative labels as the recognition history (client clock is fine). */
function formatRelative(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(deltaMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

function formatJoined(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** A settings row - label + description left, control right, hairline rules. */
function SettingRow({
  title,
  description,
  children,
  testid,
  danger = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  testid: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-5" data-testid={testid}>
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold", danger && "text-loss")}>{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  danger = false,
  testid,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
  testid: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface" data-testid={testid}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 className={cn("font-heading text-lg font-semibold tracking-tight", danger && "text-loss")}>{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="px-5 pb-2 sm:px-6">{children}</div>
    </section>
  );
}

const BADGE_OK = "inline-flex items-center rounded-full bg-profit/15 px-2.5 py-0.5 text-xs font-medium text-profit";

export function ProfileView() {
  const { data, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const security = useSecurityOverview();
  const revokeSessions = useRevokeSessions();

  // ── Editable identity (API-backed) ─────────────────────────────────────
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [bio, setBio] = React.useState("");

  // Reference extras - local document, hydrated once on the client.
  const [extras, setExtras] = React.useState<ProfileExtras>(loadExtras);
  const [savedExtras, setSavedExtras] = React.useState<ProfileExtras>(loadExtras);
  const [prefs, setPrefs] = React.useState<ProfilePrefs>(loadPrefs);

  // Hydrate the editable fields when the profile query lands - the documented
  // "adjust state during render" pattern (no setState inside an effect).
  const [hydratedFrom, setHydratedFrom] = React.useState<ProfileData | null>(null);
  if (data !== undefined && data !== hydratedFrom) {
    const split = splitName(data.name);
    setHydratedFrom(data);
    setFirstName(split.first);
    setLastName(split.last);
    setEmail(data.email);
    setBio(data.bio ?? "");
  }

  const extrasDirty =
    extras.phone !== savedExtras.phone ||
    extras.jobTitle !== savedExtras.jobTitle ||
    extras.company !== savedExtras.company ||
    extras.location !== savedExtras.location;
  const identityDirty =
    data !== undefined &&
    (joinName(firstName, lastName) !== data.name || email !== data.email || bio !== (data.bio ?? ""));
  const dirty = identityDirty || extrasDirty;

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || !dirty) return;
    const patch: Partial<ProfileData> = {};
    const fullName = joinName(firstName, lastName);
    if (fullName !== data.name) patch.name = fullName;
    if (email !== data.email) patch.email = email;
    if (bio !== (data.bio ?? "")) patch.bio = bio === "" ? null : bio;
    const finish = () => {
      setSavedExtras(extras);
      try {
        window.localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras));
      } catch {
        // Storage unavailable - the API-backed fields are still saved.
      }
      toast.success("Profile saved");
    };
    if (Object.keys(patch).length === 0) {
      finish();
      return;
    }
    updateProfile.mutate(patch, {
      onSuccess: finish,
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save profile")),
    });
  };

  // ── Avatar upload (data URL → PATCH /me, same pipeline as mocks) ────────
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
    if (file.size > 450_000) {
      toast.error("Image too large - pick one under 450 KB");
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

  // ── Tabs + Edit Profile focus ───────────────────────────────────────────
  const [tab, setTab] = React.useState("personal");
  const firstNameRef = React.useRef<HTMLInputElement>(null);
  const onEditProfile = () => {
    setTab("personal");
    requestAnimationFrame(() => firstNameRef.current?.focus());
  };

  // ── Preferences (instant local commits) ─────────────────────────────────
  const setPref = (patch: Partial<ProfilePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable - the toggle still works for the session.
      }
      return next;
    });
  };
  const setNotif = (key: keyof ProfilePrefs["notifications"], value: boolean) =>
    setPref({ notifications: { ...prefs.notifications, [key]: value } });

  // ── Data export (real client-side snapshot) ─────────────────────────────
  const onExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: data ?? null,
      extras,
      preferences: prefs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "euforia-profile-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported");
  };

  // ── Danger zone + sessions dialogs ──────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [sessionsOpen, setSessionsOpen] = React.useState(false);

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const initials =
    data.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?";
  const overview = security.data;
  const sessions = overview?.sessions ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 sm:space-y-6" data-testid="profile-view">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your identity, account, security and notification preferences - one place.
        </p>
      </header>

      {/* ── Identity header card ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface px-5 py-6 sm:px-6" data-testid="profile-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <div
              className="grid size-20 place-items-center overflow-hidden rounded-full bg-muted font-heading text-xl font-bold text-foreground ring-2 ring-border"
              data-testid="profile-avatar"
            >
              {data.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL from the profile, no optimization pipeline
                <img src={data.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <button
              type="button"
              onClick={onPickAvatar}
              aria-label="Change photo"
              title="Change photo"
              data-testid="profile-avatar-change"
              className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-accent hover:text-accent"
            >
              <Camera className="size-3.5" aria-hidden="true" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="truncate font-heading text-2xl font-extrabold tracking-tight" data-testid="profile-hero-name">
                {data.name}
              </h2>
              <span
                className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                data-testid="profile-plan-badge"
              >
                Pro Member
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="profile-hero-title">
              {extras.jobTitle}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="profile-meta-email">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{data.email}</span>
              </span>
              <span className="inline-flex items-center gap-1.5" data-testid="profile-meta-location">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {extras.location}
              </span>
              <span className="inline-flex items-center gap-1.5" data-testid="profile-meta-joined">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                Joined {formatJoined(extras.joinedAt)}
              </span>
            </div>
          </div>

          <Button type="button" variant="edit" onClick={onEditProfile} data-testid="profile-edit" className="shrink-0">
            Edit Profile
          </Button>
        </div>
      </section>

      {/* ── Tab bar + panels ─────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab} className="gap-5 sm:gap-6">
        <TabsList
          className="grid h-10 w-full grid-cols-4 rounded-lg border border-border bg-surface/60 p-1"
          data-testid="profile-tabs"
        >
          {(["personal", "account", "security", "notifications"] as const).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`profile-tab-${value}`}
              className="rounded-md border border-transparent text-xs font-medium text-muted-foreground capitalize transition-colors data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none sm:text-sm"
            >
              {value}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Personal ───────────────────────────────────────────────────── */}
        <TabsContent value="personal" className="mt-0" data-testid="profile-panel-personal">
          <SectionCard
            title="Personal Information"
            description="Update your personal details and profile information."
            testid="profile-personal-card"
          >
            <form onSubmit={onSave} className="grid gap-x-6 gap-y-5 pb-4 pt-2 sm:grid-cols-2" data-testid="profile-form">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-first-name">First Name</Label>
                <Input
                  id="profile-first-name"
                  ref={firstNameRef}
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  data-testid="profile-first-name"
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="profile-last-name">Last Name</Label>
                <Input
                  id="profile-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  data-testid="profile-last-name"
                  autoComplete="family-name"
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
              <div className="grid gap-1.5">
                <Label htmlFor="profile-phone">Phone</Label>
                <Input
                  id="profile-phone"
                  value={extras.phone}
                  onChange={(event) => setExtras((prev) => ({ ...prev, phone: event.target.value }))}
                  data-testid="profile-phone"
                  autoComplete="tel"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="profile-job-title">Job Title</Label>
                <Input
                  id="profile-job-title"
                  value={extras.jobTitle}
                  onChange={(event) => setExtras((prev) => ({ ...prev, jobTitle: event.target.value }))}
                  data-testid="profile-job-title"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="profile-company">Company</Label>
                <Input
                  id="profile-company"
                  value={extras.company}
                  onChange={(event) => setExtras((prev) => ({ ...prev, company: event.target.value }))}
                  data-testid="profile-company"
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="profile-bio">Bio</Label>
                <Textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  data-testid="profile-bio"
                  rows={3}
                  maxLength={280}
                  className="resize-y"
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="profile-location">Location</Label>
                <Input
                  id="profile-location"
                  value={extras.location}
                  onChange={(event) => setExtras((prev) => ({ ...prev, location: event.target.value }))}
                  data-testid="profile-location"
                  autoComplete="address-level2"
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
                <Button type="submit" disabled={!dirty || updateProfile.isPending} data-testid="profile-save">
                  {updateProfile.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="size-4" aria-hidden="true" />
                  )}
                  Save changes
                </Button>
              </div>
            </form>
          </SectionCard>
        </TabsContent>

        {/* ── Account ────────────────────────────────────────────────────── */}
        <TabsContent value="account" className="mt-0 space-y-5 sm:space-y-6" data-testid="profile-panel-account">
          <SectionCard
            title="Account Settings"
            description="Manage your account preferences and subscription."
            testid="profile-account-card"
          >
            <div className="divide-y divide-border">
              <SettingRow title="Account Status" description="Your account is currently active" testid="profile-row-status">
                <span className={BADGE_OK} data-testid="profile-status-badge">
                  Active
                </span>
              </SettingRow>
              <SettingRow title="Subscription Plan" description="Pro Plan - $29/month" testid="profile-row-plan">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info("Subscriptions are not active in the demo build")}
                  data-testid="profile-manage-subscription"
                >
                  Manage Subscription
                </Button>
              </SettingRow>
              <SettingRow
                title="Account Visibility"
                description="Make your profile visible to other users"
                testid="profile-row-visibility"
              >
                <Switch
                  checked={prefs.accountVisibility}
                  onCheckedChange={(checked) => setPref({ accountVisibility: checked })}
                  aria-label="Account visibility"
                  data-testid="profile-visibility-switch"
                />
              </SettingRow>
              <SettingRow title="Data Export" description="Download a copy of your data" testid="profile-row-export">
                <Button variant="outline" size="sm" onClick={onExport} data-testid="profile-export">
                  <Download className="size-4" aria-hidden="true" />
                  Export Data
                </Button>
              </SettingRow>
            </div>
          </SectionCard>

          <SectionCard
            title="Danger Zone"
            description="Irreversible and destructive actions"
            danger
            testid="profile-danger-card"
          >
            <div className="divide-y divide-border">
              <SettingRow
                title="Delete Account"
                description="Permanently delete your account and all data"
                testid="profile-row-delete"
                danger
              >
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setDeleteConfirm("");
                    setDeleteOpen(true);
                  }}
                  data-testid="profile-delete"
                  className="border border-loss/30 bg-loss/15 text-loss hover:bg-loss/25 hover:text-loss"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete Account
                </Button>
              </SettingRow>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── Security ───────────────────────────────────────────────────── */}
        <TabsContent value="security" className="mt-0" data-testid="profile-panel-security">
          <SectionCard
            title="Security Settings"
            description="Manage your account security and authentication."
            testid="profile-security-card"
          >
            <div className="divide-y divide-border">
              <SettingRow
                title="Password"
                description={
                  overview ? `Last changed ${formatRelative(overview.auth.passwordLastChangedAt)}` : "Last changed…"
                }
                testid="profile-row-password"
              >
                <Button variant="outline" size="sm" asChild data-testid="profile-change-password">
                  <a href="/security">
                    <KeyRound className="size-4" aria-hidden="true" />
                    Change Password
                  </a>
                </Button>
              </SettingRow>
              <SettingRow
                title="Two-Factor Authentication"
                description="Add an extra layer of security to your account"
                testid="profile-row-2fa"
              >
                <span
                  className={cn(BADGE_OK, !overview?.twoFactor.enabled && "bg-muted text-muted-foreground")}
                  data-testid="profile-2fa-badge"
                >
                  {overview?.twoFactor.enabled ? "Enabled" : "Disabled"}
                </span>
                <Button variant="outline" size="sm" asChild data-testid="profile-2fa-configure">
                  <a href="/security">Configure</a>
                </Button>
              </SettingRow>
              <SettingRow
                title="Login Notifications"
                description="Get notified when someone logs into your account"
                testid="profile-row-login-notifications"
              >
                <Switch
                  checked={prefs.loginNotifications}
                  onCheckedChange={(checked) => setPref({ loginNotifications: checked })}
                  aria-label="Login notifications"
                  data-testid="profile-login-notifications"
                />
              </SettingRow>
              <SettingRow
                title="Active Sessions"
                description="Manage devices that are logged into your account"
                testid="profile-row-sessions"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSessionsOpen(true)}
                  data-testid="profile-view-sessions"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  View Sessions
                </Button>
              </SettingRow>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── Notifications ──────────────────────────────────────────────── */}
        <TabsContent value="notifications" className="mt-0" data-testid="profile-panel-notifications">
          <SectionCard
            title="Notification Preferences"
            description="Choose what notifications you want to receive."
            testid="profile-notifications-card"
          >
            <div className="divide-y divide-border">
              <SettingRow title="Email Notifications" description="Receive notifications via email" testid="profile-row-notif-email">
                <Switch
                  checked={prefs.notifications.email}
                  onCheckedChange={(checked) => setNotif("email", checked)}
                  aria-label="Email notifications"
                  data-testid="profile-notif-email"
                />
              </SettingRow>
              <SettingRow
                title="Push Notifications"
                description="Receive push notifications in your browser"
                testid="profile-row-notif-push"
              >
                <Switch
                  checked={prefs.notifications.push}
                  onCheckedChange={(checked) => setNotif("push", checked)}
                  aria-label="Push notifications"
                  data-testid="profile-notif-push"
                />
              </SettingRow>
              <SettingRow
                title="Marketing Emails"
                description="Receive emails about new features and updates"
                testid="profile-row-notif-marketing"
              >
                <Switch
                  checked={prefs.notifications.marketing}
                  onCheckedChange={(checked) => setNotif("marketing", checked)}
                  aria-label="Marketing emails"
                  data-testid="profile-notif-marketing"
                />
              </SettingRow>
              <SettingRow
                title="Weekly Summary"
                description="Get a weekly summary of your activity"
                testid="profile-row-notif-weekly"
              >
                <Switch
                  checked={prefs.notifications.weekly}
                  onCheckedChange={(checked) => setNotif("weekly", checked)}
                  aria-label="Weekly summary"
                  data-testid="profile-notif-weekly"
                />
              </SettingRow>
              <SettingRow
                title="Security Alerts"
                description="Important security notifications (always enabled)"
                testid="profile-row-notif-security"
              >
                <Switch checked disabled aria-label="Security alerts (always enabled)" data-testid="profile-notif-security" />
              </SettingRow>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* ── Delete account dialog ──────────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md" data-testid="profile-delete-dialog">
          <DialogHeader>
            <DialogTitle className="text-loss">Delete Account</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and every trade, note and preference. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="profile-delete-confirm">Type DELETE to confirm</Label>
            <Input
              id="profile-delete-confirm"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              data-testid="profile-delete-confirm-input"
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} data-testid="profile-delete-cancel">
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={deleteConfirm !== "DELETE"}
              onClick={() => {
                setDeleteOpen(false);
                toast.info("Demo build - the deletion request was simulated");
              }}
              data-testid="profile-delete-confirm"
              className="border border-loss/30 bg-loss/15 text-loss hover:bg-loss/25 hover:text-loss"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Active sessions dialog ─────────────────────────────────────────── */}
      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="profile-sessions-dialog">
          <DialogHeader>
            <DialogTitle>Active Sessions</DialogTitle>
            <DialogDescription>Devices currently signed in to your account.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto" data-testid="profile-sessions-list">
            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No active sessions recorded yet.</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                  data-testid={`profile-session-row-${session.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {session.device} · {session.browser} ({session.os})
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {session.location} · {session.ipMasked} · last activity {formatRelative(session.lastActivityAt)}
                    </p>
                  </div>
                  {session.current ? (
                    <span className={cn(BADGE_OK, "shrink-0")} data-testid={`profile-session-current-${session.id}`}>
                      This device
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:bg-loss/10 hover:text-loss"
                      disabled={revokeSessions.isPending}
                      onClick={() =>
                        revokeSessions.mutate(
                          { sessionId: session.id, scope: "one" },
                          {
                            onSuccess: () => toast.success("Session revoked"),
                            onError: (error) => toast.error(apiErrorMessage(error, "Could not revoke session")),
                          },
                        )
                      }
                      data-testid={`profile-session-revoke-${session.id}`}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSessionsOpen(false)} data-testid="profile-sessions-close">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Screen-reader announcement target for the avatar picker flow */}
      <span className="sr-only" aria-live="polite">
        {data.avatarUrl ? "Profile photo set" : "No profile photo"}
      </span>
    </div>
  );
}

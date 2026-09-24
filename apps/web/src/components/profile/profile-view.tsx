"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, Save } from "lucide-react";
import { useTheme } from "next-themes";
import type { Profile as ProfileData } from "@cosmoz/shared";

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
import { UserAvatar } from "@/components/layout/user-avatar";
import { useProfile, useUpdateProfile } from "@/lib/api/queries";
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

/**
 * /profile — DIRECT editing: fields are live inputs, "Save" persists via
 * PATCH /me. The theme choice writes to next-themes (same store the topbar
 * toggle uses), so the whole app follows instantly.
 */
export function ProfileView() {
  const { data, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { theme, setTheme } = useTheme();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [timezone, setTimezone] = React.useState<string>(TIMEZONES[0]);

  // Hydrate the editable fields when the profile query lands — the documented
  // "adjust state during render" pattern (no setState inside an effect).
  const [hydratedFrom, setHydratedFrom] = React.useState<ProfileData | null>(null);
  if (data !== undefined && data !== hydratedFrom) {
    setHydratedFrom(data);
    setName(data.name);
    setEmail(data.email);
    setTimezone(data.timezone);
  }

  const dirty =
    data !== undefined &&
    (name !== data.name || email !== data.email || timezone !== data.timezone);

  const onSave = (event: React.FormEvent) => {
    event.preventDefault();
    const patch: Partial<ProfileData> = {};
    if (data && name !== data.name) patch.name = name;
    if (data && email !== data.email) patch.email = email;
    if (data && timezone !== data.timezone) patch.timezone = timezone;
    if (Object.keys(patch).length === 0) return;
    updateProfile.mutate(patch, {
      onSuccess: () => toast.success("Profile saved"),
      onError: (error) => toast.error(apiErrorMessage(error, "Could not save profile")),
    });
  };

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 sm:space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your identity across the journal — edited directly, saved on demand.
        </p>
      </header>

      <Card className="bg-surface" data-testid="profile-card">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <UserAvatar className="size-12 text-sm" />
            <div className="min-w-0">
              <CardTitle className="truncate font-heading text-lg font-semibold">
                {data.name}
              </CardTitle>
              <CardDescription className="truncate">
                Base currency {data.baseCurrency} · trading days follow your timezone
              </CardDescription>
            </div>
          </div>
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

            <div className="grid gap-1.5">
              <Label>Theme</Label>
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
    </div>
  );
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import { ImageUp, Trash2, UserRound } from "lucide-react";
import type { Profile } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  SettingsCategoryCard,
  SettingsCardSkeleton,
  SettingsRow,
  SettingsSelect,
  TIMEZONE_OPTIONS,
} from "@/components/settings/settings-primitives";
import { useProfile, useUpdateProfile } from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";

/**
 * Profile category — identity only. Edits go through PATCH /me (the profile
 * endpoint), NOT the preferences document: name / email / timezone are
 * account identity, and timezone is the single source of truth for
 * trading-day keys. Avatar is a data URL in V1 (≤ 150 KB), CDN later.
 */

const AVATAR_MAX_BYTES = 150 * 1024;

const inputClasses =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent sm:w-56";

export function ProfileCard() {
  const { data, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [timezone, setTimezone] = React.useState<string>(TIMEZONE_OPTIONS[0]);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [avatarError, setAvatarError] = React.useState<string | null>(null);

  const [hydratedFrom, setHydratedFrom] = React.useState<Profile | null>(null);
  if (data !== undefined && data !== hydratedFrom) {
    setHydratedFrom(data);
    setName(data.name);
    setUsername(data.username ?? "");
    setEmail(data.email);
    setBio(data.bio ?? "");
    setTimezone(data.timezone);
    setAvatarUrl(data.avatarUrl);
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const onPickAvatar = (file: File) => {
    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file (PNG or JPG).");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("Image is too large — pick one under 150 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  if (isLoading || !data || data !== hydratedFrom) {
    return <SettingsCardSkeleton rows={5} />;
  }

  const dirty =
    name !== data.name ||
    username !== (data.username ?? "") ||
    email !== data.email ||
    bio !== (data.bio ?? "") ||
    timezone !== data.timezone ||
    avatarUrl !== data.avatarUrl;

  const usernameInvalid = username !== "" && !/^[a-zA-Z0-9_-]{3,30}$/.test(username);

  const onSave = () => {
    updateProfile.mutate(
      {
        name,
        email,
        timezone,
        username: username === "" ? null : username,
        bio: bio === "" ? null : bio,
        avatarUrl,
      },
      {
        onSuccess: () => toast.success("Profile saved"),
        onError: (error) => toast.error(apiErrorMessage(error, "Could not save profile")),
      },
    );
  };

  return (
    <SettingsCategoryCard
      icon={UserRound}
      title="Profile"
      description="Your identity across the journal — avatar, name, handle and the timezone that drives your trading days."
      testid="settings-profile"
      dirty={dirty && !usernameInvalid}
      saving={updateProfile.isPending}
      onSave={onSave}
    >
      <div className="flex flex-wrap items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL, no optimization pipeline in V1
          <img
            src={avatarUrl}
            alt=""
            className="size-16 rounded-full object-cover ring-1 ring-border"
            data-testid="settings-profile-avatar-preview"
          />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-accent/15 font-heading text-lg font-bold text-accent ring-1 ring-border">
            {name.slice(0, 1).toUpperCase() || "?"}
          </span>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              data-testid="settings-profile-avatar-upload"
            >
              <ImageUp className="size-3.5" aria-hidden="true" />
              Upload
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAvatarUrl(null)}
                data-testid="settings-profile-avatar-remove"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">PNG or JPG, under 150 KB.</p>
          {avatarError ? (
            <p className="text-xs text-loss" role="status">
              {avatarError}
            </p>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          aria-label="Avatar image"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPickAvatar(file);
            event.target.value = "";
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsRow label="Name" htmlFor="settings-profile-name">
          <input
            id="settings-profile-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClasses}
            autoComplete="name"
            required
            data-testid="settings-profile-name"
          />
        </SettingsRow>
        <SettingsRow
          label="Username"
          htmlFor="settings-profile-username"
          hint="Letters, digits, _ and - (3–30 chars)."
        >
          <input
            id="settings-profile-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={`${inputClasses} font-mono`}
            aria-invalid={usernameInvalid}
            autoComplete="off"
            data-testid="settings-profile-username"
          />
        </SettingsRow>
      </div>

      {usernameInvalid ? (
        <p className="text-xs text-loss" role="status" data-testid="settings-profile-username-error">
          Username must be 3–30 characters: letters, digits, underscore or dash.
        </p>
      ) : null}

      <SettingsRow label="Email" htmlFor="settings-profile-email">
        <input
          id="settings-profile-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClasses}
          autoComplete="email"
          required
          data-testid="settings-profile-email"
        />
      </SettingsRow>

      <SettingsRow label="Bio" htmlFor="settings-profile-bio" stacked hint={`${bio.length}/280`}>
        <Textarea
          id="settings-profile-bio"
          value={bio}
          onChange={(event) => setBio(event.target.value.slice(0, 280))}
          rows={3}
          placeholder="A few lines about your trading focus…"
          data-testid="settings-profile-bio"
        />
      </SettingsRow>

      <SettingsRow
        label="Timezone"
        htmlFor="settings-profile-timezone"
        hint="Drives your local trading days — when a “day” starts and ends. Shared with the Localization tab."
      >
        <SettingsSelect
          value={timezone}
          onChange={setTimezone}
          options={TIMEZONE_OPTIONS.map((zone) => ({ value: zone, label: zone }))}
          testid="settings-profile-timezone"
        />
      </SettingsRow>
    </SettingsCategoryCard>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BadgeCheck,
  Download,
  LogOut,
  PauseCircle,
  Trash2,
  UserCog,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ConfirmDialog,
  SettingsCardSkeleton,
} from "@/components/settings/settings-primitives";
import {
  useAccounts,
  useDeactivateAccount,
  useProfile,
  useRequestAccountDeletion,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { exportBackupWithToasts } from "@/lib/utils/backup-export";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Account — identity summary, plan, connected trading accounts and the
 * DANGEROUS actions. Deactivation pauses the journal; deletion schedules a
 * 14-day grace period and requires typing DELETE. Both send typed
 * confirmation payloads the API validates server-side.
 */
export function AccountCard() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: accountsData, isLoading: accountsLoading } = useAccounts();
  const deactivate = useDeactivateAccount();
  const requestDeletion = useRequestAccountDeletion();
  const { dict } = useI18n();
  const L = dict.settings.account;
  const S = dict.settings.shared;
  const B = dict.settings.backup;

  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  if (profileLoading || accountsLoading || !profile) {
    return <SettingsCardSkeleton rows={5} />;
  }

  const onDeactivate = () => {
    deactivate.mutate(
      { confirmation: "DEACTIVATE" },
      {
        onSuccess: () => {
          setDeactivateOpen(false);
          toast.success(L.toastDeactivated, {
            description: L.toastDeactivatedDescription,
          });
        },
        onError: (error) => toast.error(apiErrorMessage(error, L.toastDeactivateFailed)),
      },
    );
  };

  const onDelete = () => {
    requestDeletion.mutate(
      { confirmation: "DELETE" },
      {
        onSuccess: (response) => {
          setDeleteOpen(false);
          const until = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
            new Date(response.scheduledFor),
          );
          toast.success(L.toastDeletionScheduled, {
            description: `${L.toastDeletionDatePrefix} ${until}${L.toastDeletionDateSuffix}`,
          });
        },
        onError: (error) => toast.error(apiErrorMessage(error, L.toastDeletionFailed)),
      },
    );
  };

  const onExport = async () => {
    setExporting(true);
    await exportBackupWithToasts({
      title: B.exportToastTitle,
      tradesWord: B.exportToastTrades,
      strategiesWord: B.exportToastStrategies,
      tagsWord: B.exportToastTags,
      failedTitle: B.exportToastFailed,
      failedDescription: B.exportToastFailedDescription,
    });
    setExporting(false);
  };

  return (
    <>
      <div className="grid gap-4">
        <div
          className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
          data-testid="settings-account"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCog className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <h2 className="font-heading text-base font-semibold">{L.title}</h2>
            </div>
            <Badge variant="outline" className="gap-1 border-accent/40 text-accent">
              <BadgeCheck className="size-3" aria-hidden="true" />
              {L.planBadge}
            </Badge>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2" data-testid="settings-account-info">
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">{S.name}</dt>
              <dd className="font-medium">{profile.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">{S.email}</dt>
              <dd className="truncate font-medium">{profile.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">{S.username}</dt>
              <dd className="font-mono text-[13px] font-medium">
                {profile.username ?? "-"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">{L.baseCurrency}</dt>
              <dd className="font-mono text-[13px] font-medium">{profile.baseCurrency}</dd>
            </div>
          </dl>

          <Separator />

          {/* Connected trading accounts — summary only, managed elsewhere. */}
          <div className="grid gap-3" data-testid="settings-account-connected">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-semibold">{L.connectedTitle}</span>
            </div>
            <ul className="grid gap-2">
              {(accountsData?.accounts ?? []).map((account) => (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{account.name}</span>
                    {account.isDefault ? (
                      <Badge variant="outline" className="text-[10px]">
                        {L.defaultBadge}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {account.type} · {account.broker} · {account.currency}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {L.connectedNote}
            </p>
          </div>

          <Separator />

          {/* Data ownership */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium">{L.dataTitle}</span>
              <p className="text-xs text-muted-foreground">
                {L.dataDescription}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onExport()}
              disabled={exporting}
              data-testid="settings-account-export"
            >
              <Download className="size-3.5" aria-hidden="true" />
              {exporting ? S.exporting : L.exportData}
            </Button>
          </div>
        </div>

        {/* Danger zone — explicit, typed confirmations. */}
        <div
          className="grid gap-4 rounded-xl border border-loss/40 p-4 sm:p-5"
          data-testid="settings-account-danger"
        >
          <div className="flex items-center gap-2">
            <PauseCircle className="size-4 shrink-0 text-loss" aria-hidden="true" />
            <h2 className="font-heading text-base font-semibold text-loss">{L.dangerTitle}</h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium">{L.deactivateTitle}</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {L.deactivateDescription}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeactivateOpen(true)}
              disabled={deactivate.isPending}
              data-testid="settings-account-deactivate"
            >
              {L.deactivateButton}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-loss/20 pt-4">
            <div className="min-w-0">
              <span className="text-sm font-medium">{L.deleteTitle}</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {L.deleteDescription}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={requestDeletion.isPending}
              data-testid="settings-account-delete"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {L.deleteButton}
            </Button>
          </div>
        </div>

        {/* Sign out — same shell-level stub as before the module existed. */}
        <div className="flex justify-end">
          <Button variant="outline" asChild>
            <Link href="/login" data-testid="settings-account-signout">
              <LogOut className="size-4" aria-hidden="true" />
              {L.signOut}
            </Link>
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={L.deactivateDialogTitle}
        description={L.deactivateDialogDescription}
        confirmLabel={L.deactivateConfirm}
        onConfirm={onDeactivate}
        pending={deactivate.isPending}
        destructive
        testid="settings-account-deactivate"
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={L.deleteDialogTitle}
        description={L.deleteDialogDescription}
        confirmLabel={L.deleteConfirm}
        onConfirm={onDelete}
        pending={requestDeletion.isPending}
        destructive
        requireTyped="DELETE"
        testid="settings-account-delete"
      />
    </>
  );
}

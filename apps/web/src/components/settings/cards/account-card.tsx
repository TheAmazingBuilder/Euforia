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
          toast.success("Account deactivated", {
            description: "Your journal is paused — sign back in any time to reactivate it.",
          });
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Could not deactivate the account")),
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
          toast.success("Deletion scheduled", {
            description: `Your account will be deleted on ${until}. Sign back in before then to cancel.`,
          });
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Could not schedule the deletion")),
      },
    );
  };

  const onExport = async () => {
    setExporting(true);
    await exportBackupWithToasts();
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
              <h2 className="font-heading text-base font-semibold">Account</h2>
            </div>
            <Badge variant="outline" className="gap-1 border-accent/40 text-accent">
              <BadgeCheck className="size-3" aria-hidden="true" />
              FREE plan
            </Badge>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2" data-testid="settings-account-info">
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="font-medium">{profile.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="truncate font-medium">{profile.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">Username</dt>
              <dd className="font-mono text-[13px] font-medium">
                {profile.username ?? "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">Base currency</dt>
              <dd className="font-mono text-[13px] font-medium">{profile.baseCurrency}</dd>
            </div>
          </dl>

          <Separator />

          {/* Connected trading accounts — summary only, managed elsewhere. */}
          <div className="grid gap-3" data-testid="settings-account-connected">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-semibold">Connected trading accounts</span>
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
                        default
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
              Broker connections and credentials are managed in Integrations — never stored in preferences.
            </p>
          </div>

          <Separator />

          {/* Data ownership */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium">Your data</span>
              <p className="text-xs text-muted-foreground">
                Full JSON snapshot — trades, strategies, tags. Also in Privacy.
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
              {exporting ? "Exporting…" : "Export data"}
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
            <h2 className="font-heading text-base font-semibold text-loss">Danger zone</h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium">Deactivate account</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Pause the journal. Your data is kept; sign back in to reactivate.
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
              Deactivate…
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-loss/20 pt-4">
            <div className="min-w-0">
              <span className="text-sm font-medium">Delete account</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Permanent removal after a 14-day grace period. Requires typing DELETE.
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
              Delete…
            </Button>
          </div>
        </div>

        {/* Sign out — same shell-level stub as before the module existed. */}
        <div className="flex justify-end">
          <Button variant="outline" asChild>
            <Link href="/login" data-testid="settings-account-signout">
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Link>
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate your account?"
        description="The journal becomes read-only and alerts stop. Nothing is deleted — signing back in reactivates everything."
        confirmLabel="Deactivate account"
        onConfirm={onDeactivate}
        pending={deactivate.isPending}
        destructive
        testid="settings-account-deactivate"
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your account?"
        description="All trades, journals and analytics will be permanently deleted after a 14-day grace period. This is the point of no return — type DELETE to confirm."
        confirmLabel="Schedule deletion"
        onConfirm={onDelete}
        pending={requestDeletion.isPending}
        destructive
        requireTyped="DELETE"
        testid="settings-account-delete"
      />
    </>
  );
}

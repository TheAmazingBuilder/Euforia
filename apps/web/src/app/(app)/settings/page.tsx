import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/settings");

export const metadata: Metadata = {
  title: nav.label,
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PagePlaceholder
        title={nav.label}
        description={nav.description}
        comingSoon={nav.comingSoon}
      />
      {/* Shell-level stub: the only way to reach the auth screens for now */}
      <div className="mx-auto flex w-full max-w-3xl justify-end">
        <Button variant="outline" asChild>
          <Link href="/login">
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Link>
        </Button>
      </div>
    </div>
  );
}

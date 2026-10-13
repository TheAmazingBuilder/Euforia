import Link from "next/link";
import { COSMOZ_VERSION } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Cosmoz",
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-heading text-6xl font-bold tracking-tight">
          Cosmoz
        </h1>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          v{COSMOZ_VERSION} — foundation build
        </p>
      </div>
      <Button asChild>
        <Link href="/theme-test">Open theme test</Link>
      </Button>
    </main>
  );
}

import { Construction } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PagePlaceholderProps = {
  title: string;
  description: string;
  comingSoon: string;
};

/**
 * Shared placeholder for every (app) screen until its phase arrives.
 * Server-component safe; semantic tokens only.
 */
export function PagePlaceholder({
  title,
  description,
  comingSoon,
}: PagePlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </header>

      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Construction
              className="size-4 text-accent"
              aria-hidden="true"
            />
            Coming in a later phase
          </CardTitle>
          <CardDescription>{comingSoon}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The navigation shell, routing and the 3-theme system are already
          live &mdash; this screen is intentionally empty until its phase is
          approved.
        </CardContent>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

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
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm border-border bg-surface">
      <CardHeader className="items-start gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-accent font-heading text-base font-bold text-accent-foreground">
          C
        </span>
        <div className="space-y-1.5">
          <CardTitle className="font-heading text-xl font-semibold">
            Sign in to Cosmoz
          </CardTitle>
          <CardDescription>
            Welcome back, trader &mdash; your journal and your coach are
            waiting.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            disabled
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            placeholder="••••••••"
            disabled
          />
        </div>
        <Button disabled className="w-full">
          Sign in
        </Button>
        <p className="text-xs text-muted-foreground">
          Real authentication arrives in a later phase &mdash; this screen is a
          shell placeholder.
        </p>
        <Separator className="bg-border" />
        <div className="flex flex-col gap-2 text-sm">
          <Link
            href="/register"
            className="text-accent underline-offset-4 hover:underline"
          >
            No account yet? Create one
          </Link>
          <Link
            href="/"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            &larr; Back to dashboard
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

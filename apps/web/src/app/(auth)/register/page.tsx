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
  title: "Create account",
};

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-sm border-border bg-surface">
      <CardHeader className="items-start gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-accent font-heading text-base font-bold text-accent-foreground">
          C
        </span>
        <div className="space-y-1.5">
          <CardTitle className="font-heading text-xl font-semibold">
            Create your account
          </CardTitle>
          <CardDescription>
            Start journaling your trades and let the coach keep you honest.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            placeholder="you@example.com"
            disabled
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            placeholder="••••••••"
            disabled
          />
        </div>
        <Button disabled className="w-full">
          Create account
        </Button>
        <p className="text-xs text-muted-foreground">
          Real authentication arrives in a later phase &mdash; this screen is a
          shell placeholder.
        </p>
        <Separator className="bg-border" />
        <div className="flex flex-col gap-2 text-sm">
          <Link
            href="/login"
            className="text-accent underline-offset-4 hover:underline"
          >
            Already have an account? Sign in
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

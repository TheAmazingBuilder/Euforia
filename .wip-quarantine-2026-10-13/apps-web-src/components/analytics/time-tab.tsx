"use client";

import * as React from "react";
import type { AnalyticsResponse } from "@cosmoz/shared";

import { BucketBars } from "@/components/analytics/bucket-bars";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * By-Time tab (Phase 9): average R by UTC hour bucket, weekday and session.
 * Every bar carries its n; buckets below 10 trades get the warning-tinted
 * count — never a rate without its sample size.
 */

interface TimeTabProps {
  analytics: AnalyticsResponse;
}

export function TimeTab({ analytics }: TimeTabProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            By hour of day (UTC)
          </CardTitle>
          <CardDescription>
            Where in the 24-hour cycle does your edge actually live? Sessions overlap
            these windows — compare with the breakdown below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BucketBars
            buckets={analytics.hourBuckets}
            ariaLabel="Average R by UTC hour bucket, each bar labeled with its trade count"
            height={280}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
        <Card className="card-hover bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">By weekday</CardTitle>
            <CardDescription>
              Mondays first, as the trading week unfolds — fatigue patterns usually
              surface at the edges of the week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BucketBars
              buckets={analytics.weekdayBuckets}
              ariaLabel="Average R by weekday, each bar labeled with its trade count"
              height={240}
            />
          </CardContent>
        </Card>

        <Card className="card-hover bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">By session</CardTitle>
            <CardDescription>
              Asia, London and New York windows — the classic structure check for a
              time-based edge.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BucketBars
              buckets={analytics.sessionBuckets}
              ariaLabel="Average R by trading session, each bar labeled with its trade count"
              height={240}
            />
          </CardContent>
        </Card>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Bars with fewer than 10 trades are flagged in the axis label — a positive
        average on n=3 is an anecdote, not an edge. Empty windows render as a flat
        dash with n=0.
      </p>
    </div>
  );
}

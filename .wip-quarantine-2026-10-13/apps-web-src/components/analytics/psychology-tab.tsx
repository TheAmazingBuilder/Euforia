"use client";

import * as React from "react";
import type { AnalyticsResponse } from "@cosmoz/shared";

import { BucketBars } from "@/components/analytics/bucket-bars";
import { GradeMatrix } from "@/components/analytics/grade-matrix";
import { SleepScatter } from "@/components/analytics/sleep-scatter";
import { TiltTimeline } from "@/components/analytics/tilt-timeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * By-Psychology tab (Phase 9): pre-trade emotion vs outcome, the hindsight
 * check matrix (grade × outcome), the tilt timeline and the sleep scatter.
 * Correlations are descriptive — each panel repeats its sample size.
 */

interface PsychologyTabProps {
  analytics: AnalyticsResponse;
}

export function PsychologyTab({ analytics }: PsychologyTabProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Pre-trade emotion vs outcome
          </CardTitle>
          <CardDescription>
            Average R by the emotion you logged before entry, worst first — the
            friction you feel is data, not noise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.emotionBuckets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No emotion logged on closed trades yet — the in-trade quick-log feeds
              this panel.
            </p>
          ) : (
            <BucketBars
              buckets={analytics.emotionBuckets}
              ariaLabel="Average R by pre-trade emotion, worst first, each bar labeled with its trade count"
              height={260}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
        <Card className="card-hover bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">
              Grade × outcome — the hindsight check
            </CardTitle>
            <CardDescription>
              Decision grades lock before the reveal; a clean grader shows no
              pattern across this matrix.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GradeMatrix rows={analytics.gradeMatrix} />
          </CardContent>
        </Card>

        <Card className="card-hover bg-surface">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">
              Tilt timeline — risk after losses
            </CardTitle>
            <CardDescription>
              Committed risk per closed trade; warning bars are size increases
              right after a losing streak.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.tilt.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No closed trade yet — the tilt timeline builds as your history grows.
              </p>
            ) : (
              <TiltTimeline points={analytics.tilt} currency={analytics.currency} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="card-hover bg-surface">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">
            Sleep vs daily P&L
          </CardTitle>
          <CardDescription>
            Rest is the cheapest edge candidate — here is what your nights say
            about your days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SleepScatter points={analytics.sleepScatter} currency={analytics.currency} />
        </CardContent>
      </Card>
    </div>
  );
}

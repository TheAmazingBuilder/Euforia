"use client";

/**
 * ImportView — the module shell (spec §7/§44): header band, Overview and
 * History tabs, the creation wizard (?view=new) and the job workspace
 * (?job=<id>). URL state keeps the primary context refresh-safe.
 */

import * as React from "react";
import { Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  recognitionService,
  useMounted,
  useRecognitionJob,
  useRecognitionJobs,
} from "@/lib/recognition/use-recognition";
import { useI18n } from "@/i18n/i18n-provider";
import { useImportParams } from "./import-shared";
import { ImportOverview, ImportOverviewSkeleton } from "./import-overview";
import { ImportHistory } from "./import-history";
import { ImportNewFlow } from "./import-new-flow";
import { RecognitionWorkspace } from "./recognition-workspace";
import { recognitionErrorMessage } from "./import-shared";

export function ImportView() {
  const { dict } = useI18n();
  const V = dict.recognition.view;
  const mounted = useMounted();
  const jobs = useRecognitionJobs();
  const { searchParams, setParams } = useImportParams();

  const tab = searchParams.get("tab") === "history" ? "history" : "overview";
  const view = searchParams.get("view");
  const jobId = searchParams.get("job");
  const activeJob = useRecognitionJob(jobId);

  const setTab = (nextTab: string) => {
    setParams({ tab: nextTab === "overview" ? null : nextTab });
  };

  const openNewFlow = () => setParams({ view: "new" });
  const openJob = (id: string) => setParams({ job: id, view: null });
  const backToOverview = () => setParams({ job: null, view: null });
  const backToHistory = () => setParams({ job: null, view: null, tab: "history" });

  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const onRetry = async (id: string) => {
    setRetryingId(id);
    try {
      await recognitionService.retryRecognition(id);
      openJob(id);
    } catch (error) {
      toast.error(recognitionErrorMessage(error, dict.recognition));
    } finally {
      setRetryingId(null);
    }
  };

  const wizardOpen = view === "new" && activeJob === null;
  const showWorkspace = jobId !== null;

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6"
      data-testid="import-view"
    >
      {/* Header band */}
      <header
        className="overflow-hidden rounded-xl border bg-surface"
        data-testid="import-header"
      >
        <div className="flex flex-col gap-3 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ScanLine className="size-3.5 text-accent" aria-hidden />
              {dict.nav.sections.Tools}
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">
              {V.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {V.subtitle}
            </p>
          </div>
          {!wizardOpen && !showWorkspace && (
            <Button
              type="button"
              onClick={openNewFlow}
              className="shrink-0 self-start lg:self-center"
              data-testid="import-header-cta"
              aria-label={V.newCtaAria}
            >
              {V.newCta}
            </Button>
          )}
        </div>
      </header>

      {/* Creation wizard (spec §4: upload → configure → processing …) */}
      {wizardOpen && (
        <ImportNewFlow
          onJobCreated={(id) => setParams({ view: null, job: id })}
          onCancel={backToOverview}
        />
      )}

      {/* Job workspace (?job=<id>) */}
      {showWorkspace && (
        <>
          {!mounted ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : (
            <RecognitionWorkspace
              jobId={jobId}
              onBack={tab === "history" ? backToHistory : backToOverview}
              onImportAnother={() => setParams({ job: null, view: "new" })}
            />
          )}
        </>
      )}

      {/* Tabs (overview | history) */}
      {!wizardOpen && !showWorkspace && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="line" data-testid="import-tabs">
            {[
              { id: "overview", label: V.tabs.overview },
              { id: "history", label: V.tabs.history },
            ].map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} data-testid={`import-tab-${entry.id}`}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            {!mounted ? (
              <ImportOverviewSkeleton />
            ) : (
              <ImportOverview
                jobs={jobs}
                onUploadCta={openNewFlow}
                onOpenJob={openJob}
                onOpenHistory={() => setTab("history")}
              />
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {!mounted ? (
              <div className="space-y-2" aria-hidden>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <ImportHistory
                jobs={jobs}
                onOpen={openJob}
                onRetry={onRetry}
                onUploadCta={openNewFlow}
                retryingId={retryingId}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

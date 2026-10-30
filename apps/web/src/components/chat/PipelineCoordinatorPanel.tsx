import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  pipelineRunStatusLabel,
  stepName,
} from "@t3tools/client-runtime/pipeline-run-presentation";
import { pipelineProgressSegments } from "@t3tools/client-runtime/state/pipeline-nesting";
import type { PipelineRun, PipelineRunSummary, ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { useThreadShell } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { buildThreadRouteParams } from "../../threadRoutes";
import { PipelineProgressBar } from "../PipelineProgressBar";

// ChatView renders this panel, so it loads lazily to keep the import cycle out of module setup.
const ChatView = lazy(() => import("../ChatView"));

/** The progress bar's input: a full run carries everything a live-run summary does. */
function summarizeRun(run: PipelineRun): PipelineRunSummary {
  return {
    id: run.id,
    parentThreadId: run.parentThreadId,
    name: run.definition.name,
    status: run.status,
    pauseReason: run.pauseReason,
    currentStepIndex: run.currentStepIndex,
    steps: run.steps.map((step) => ({
      stepId: step.stepId,
      name: stepName(run, step.index),
      status: step.status,
      childThreadId: step.childThreadId,
    })),
  };
}

/**
 * The run's coordinator chat inside a step's thread. It is the parent thread's own conversation
 * and composer, so it stays in sync with the run's main page, and it is subscribed only while the
 * tab is open.
 */
export function PipelineCoordinatorPanel(props: { readonly stepThreadRef: ScopedThreadRef }) {
  const { environmentId, threadId } = props.stepThreadRef;
  const navigate = useNavigate();
  const stepShell = useThreadShell(props.stepThreadRef);
  const runId = stepShell?.pipeline?.runId ?? null;
  const run =
    useEnvironmentQuery(
      runId === null
        ? null
        : serverEnvironment.pipelineRunLive({ environmentId, input: { runId } }),
    ).data?.run ?? null;
  if (run === null) {
    return <p className="p-4 text-sm text-muted-foreground">Loading pipeline run...</p>;
  }
  const segments = pipelineProgressSegments(summarizeRun(run), [], () => "ready").map(
    (segment, index) => ({
      stepId: segment.stepId,
      label: segment.label,
      status: segment.status,
      threadId: run.steps[index]?.childThreadId ?? null,
    }),
  );
  const currentIndex = run.currentStepIndex;
  const openThread = (target: ScopedThreadRef) =>
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(target) });
  const parentRef = scopeThreadRef(environmentId, run.parentThreadId);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="pipeline-coordinator-panel">
      <div className="flex shrink-0 flex-col gap-1 border-b border-border/60 px-3 py-2">
        <div className="flex">
          <PipelineProgressBar
            segments={segments}
            tooltipSide="left"
            onOpenStep={(stepThreadId) => openThread(scopeThreadRef(environmentId, stepThreadId))}
          />
        </div>
        <button
          type="button"
          className="min-w-0 cursor-pointer truncate text-start text-xs text-muted-foreground hover:text-foreground"
          aria-label="Open the run's main page"
          onClick={() => openThread(parentRef)}
        >
          Step {currentIndex + 1}/{run.steps.length} · {stepName(run, currentIndex)} ·{" "}
          {pipelineRunStatusLabel(run)}
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col" data-step-thread={threadId}>
        <Suspense fallback={null}>
          <ChatView
            key={run.parentThreadId}
            environmentId={environmentId}
            threadId={run.parentThreadId}
            routeKind="server"
            embedded
          />
        </Suspense>
      </div>
    </div>
  );
}

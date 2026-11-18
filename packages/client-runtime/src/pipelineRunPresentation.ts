import type { PipelineRun, PipelineRunStep, ThreadId } from "@t3tools/contracts";
import {
  pipelineAttentionTargets,
  type PipelineNestable,
  type PipelineStepWait,
  type PipelineStepWaitOf,
} from "./state/pipelineNesting.ts";
import { resolveT3McpToolId } from "@t3tools/shared/t3McpToolPresentation";
import { compactDynamicToolOutput } from "@t3tools/shared/toolOutput";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";

export interface PipelineRunActions {
  readonly continue: boolean;
  readonly retry: boolean;
  readonly skip: boolean;
  readonly cancel: boolean;
  /** Whether the "pause before" flag of the step at `stepIndex` can still be changed. */
  readonly canTogglePauseBefore: (stepIndex: number) => boolean;
  /**
   * Whether the run can start over from the step at `stepIndex`. The current step of a paused
   * or cancelled run is offered as Retry instead.
   */
  readonly rerunFrom: (stepIndex: number) => boolean;
  /**
   * Whether feedback can be sent to the step at `stepIndex`: it already ran and is not working
   * right now. A step that is working is steered in its own thread instead.
   */
  readonly revise: (stepIndex: number) => boolean;
}

/**
 * Mirrors the server guards: continue needs paused; retry/skip need paused or
 * cancelled; cancel needs running or paused; rerun needs paused, cancelled or completed;
 * revise needs a step that ran and is not working.
 */
export function availablePipelineActions(run: PipelineRun): PipelineRunActions {
  const paused = run.status === "paused";
  const resumable = paused || run.status === "cancelled";
  const editable = run.status !== "completed";
  return {
    continue: paused,
    retry: resumable,
    skip: resumable,
    cancel: run.status === "running" || paused,
    canTogglePauseBefore: (stepIndex) => {
      if (!editable) return false;
      if (stepIndex > run.currentStepIndex) return stepIndex < run.steps.length;
      if (stepIndex < run.currentStepIndex) return false;
      return run.steps[stepIndex]?.status === "pending";
    },
    revise: (stepIndex) => {
      const step = run.steps[stepIndex];
      if (step === undefined || stepIndex > run.currentStepIndex) return false;
      // A step skipped at its pause gate never ran either.
      if (step.attempt === 0) return false;
      if (stepIndex < run.currentStepIndex) return true;
      if (step.status === "running") return pipelineStepAwaitsHandoff(run, stepIndex);
      return step.status !== "pending";
    },
    rerunFrom: (stepIndex) => {
      if (stepIndex < 0 || stepIndex >= run.steps.length) return false;
      if (run.status === "completed") return stepIndex <= run.currentStepIndex;
      return resumable && stepIndex < run.currentStepIndex;
    },
  };
}

export function stepName(
  run: Pick<PipelineRun, "definition">,
  index: number,
  resolve: MFunctionType = mFallback,
): string {
  return run.definition.steps[index]?.name ?? resolve(msg("Step {number}", { number: index + 1 }));
}

/** Whether the run is paused because the step at `stepIndex` ended its turn without a handoff. */
export function pipelineStepAwaitsHandoff(
  run: Pick<PipelineRun, "status" | "pauseReason" | "currentStepIndex">,
  stepIndex: number,
): boolean {
  return (
    run.status === "paused" &&
    run.pauseReason === "awaiting_handoff" &&
    run.currentStepIndex === stepIndex
  );
}

/** The thread of the current step when the run waits for its handoff, else null. */
export function pipelineAwaitingHandoffThreadId(run: PipelineRun | null) {
  if (run === null || !pipelineStepAwaitsHandoff(run, run.currentStepIndex)) return null;
  return run.steps[run.currentStepIndex]?.childThreadId ?? null;
}

/** A step row's status while its thread waits after ending its turn without a handoff. */
export function pipelineStepWaitLabel(
  wait: PipelineStepWait,
  resolve: MFunctionType = mFallback,
): string {
  switch (wait) {
    case "pull_request":
      return resolve(msg("Waiting on pull request"));
    case "background_work":
      return resolve(msg("Waiting on background work"));
    case "possibly_stuck":
      return resolve(msg("Possibly stuck"));
  }
}

/** `hours`: how long a step may wait on background work before the label calls it stuck. */
function maybeStuckText(name: string, hours: number | undefined, resolve: MFunctionType): string {
  return hours === undefined
    ? resolve(msg("{name} may be stuck: background work has run for a long time", { name }))
    : resolve(
        msg("{name} may be stuck: background work has run for over {hours} h", { name, hours }),
      );
}

/**
 * `feedingActive`: the step before a still-pending current step is still working.
 * `wait`: what the current step's thread is waiting on after its turn ended without a handoff.
 * `stuckAfterHours`: the threshold behind a `possibly_stuck` wait.
 */
export function pipelineRunStatusLabel(
  run: PipelineRun,
  feedingActive = false,
  wait: PipelineStepWait | null = null,
  stuckAfterHours?: number,
  resolve: MFunctionType = mFallback,
): string {
  const name = stepName(run, run.currentStepIndex, resolve);
  switch (run.status) {
    case "running": {
      const feeding = pipelineFeedingStep(run, resolve);
      if (feeding !== null) {
        return feedingActive
          ? resolve(msg("Finishing {name}", { name: feeding.name }))
          : resolve(msg("Starting {name}", { name }));
      }
      return resolve(
        msg("Running step {number} of {total} · {name}", {
          number: run.currentStepIndex + 1,
          total: run.definition.steps.length,
          name,
        }),
      );
    }
    case "paused":
      switch (run.pauseReason) {
        case "awaiting_continue":
          return resolve(msg("Paused before {name}", { name }));
        case "awaiting_handoff":
          switch (wait) {
            case "pull_request":
              return resolve(msg("{name} is waiting on a pull request", { name }));
            case "background_work":
              return resolve(msg("{name} is waiting on background work", { name }));
            case "possibly_stuck":
              return maybeStuckText(name, stuckAfterHours, resolve);
            default:
              return resolve(msg("{name} ended without handing off", { name }));
          }
        case "step_failed":
          return resolve(msg("Step {name} failed", { name }));
        case "step_stopped":
          return resolve(msg("Step {name} stopped", { name }));
        default:
          return resolve(msg("Paused", { $context: "pipeline run status" }));
      }
    case "completed":
      return resolve(msg("Completed", { $context: "pipeline run status" }));
    case "cancelled":
      return resolve(msg("Cancelled", { $context: "pipeline run status" }));
    default:
      return resolve(msg("Unknown", { $context: "pipeline run status" }));
  }
}

/** The run's state without a step name, for headers that already show the current step. */
export function pipelineRunStateLabel(
  run: Pick<PipelineRun, "status" | "pauseReason">,
  wait: PipelineStepWait | null = null,
  resolve: MFunctionType = mFallback,
): string {
  switch (run.status) {
    case "running":
      return resolve(msg("Running", { $context: "pipeline run status" }));
    case "paused":
      switch (run.pauseReason) {
        case "awaiting_handoff":
          return wait === "pull_request"
            ? resolve(msg("Waiting on pull request"))
            : wait === "background_work"
              ? resolve(msg("Background work", { $context: "pipeline run status" }))
              : wait === "possibly_stuck"
                ? resolve(msg("Possibly stuck"))
                : resolve(msg("No handoff", { $context: "pipeline run status" }));
        case "step_failed":
          return resolve(msg("Failed", { $context: "pipeline run status" }));
        case "step_stopped":
          return resolve(msg("Stopped", { $context: "pipeline run status" }));
        default:
          return resolve(msg("Paused", { $context: "pipeline run status" }));
      }
    case "completed":
      return resolve(msg("Completed", { $context: "pipeline run status" }));
    case "cancelled":
      return resolve(msg("Cancelled", { $context: "pipeline run status" }));
    default:
      return resolve(msg("Unknown", { $context: "pipeline run status" }));
  }
}

export function pipelineStepStatusLabel(
  step: Pick<PipelineRunStep, "status">,
  resolve: MFunctionType = mFallback,
): string {
  switch (step.status) {
    case "pending":
      return resolve(msg("Pending", { $context: "pipeline step status" }));
    case "running":
      return resolve(msg("Running", { $context: "pipeline step status" }));
    case "completed":
      return resolve(msg("Completed", { $context: "pipeline step status" }));
    case "failed":
      return resolve(msg("Failed", { $context: "pipeline step status" }));
    case "stopped":
      return resolve(msg("Stopped", { $context: "pipeline step status" }));
    case "skipped":
      return resolve(msg("Skipped", { $context: "pipeline step status" }));
    case "cancelled":
      return resolve(msg("Cancelled", { $context: "pipeline step status" }));
    default:
      return resolve(msg("Unknown", { $context: "pipeline step status" }));
  }
}

/** Where a step's thread sits in its run; null for a step the run does not have. */
export function pipelineStepPosition(
  run: Pick<PipelineRun, "definition" | "steps">,
  stepId: string,
  resolve: MFunctionType = mFallback,
): { readonly number: number; readonly total: number; readonly name: string } | null {
  const index = run.steps.findIndex((step) => step.stepId === stepId);
  if (index < 0) return null;
  return {
    number: index + 1,
    total: run.definition.steps.length,
    name: stepName(run, index, resolve),
  };
}

/** Breadcrumb for a step's thread: "Pipeline: <name> · step n/N". */
export function pipelineStepBreadcrumbTitle(
  run: Pick<PipelineRun, "definition" | "steps">,
  stepId: string,
  resolve: MFunctionType = mFallback,
): string {
  const position = pipelineStepPosition(run, stepId, resolve);
  const name = run.definition.name;
  return position
    ? resolve(
        msg("Pipeline: {name} · step {number}/{total}", {
          name,
          number: position.number,
          total: position.total,
        }),
      )
    : resolve(msg("Pipeline: {name}", { name }));
}

export interface PipelineFeedingStep {
  readonly index: number;
  readonly name: string;
  readonly childThreadId: NonNullable<PipelineRunStep["childThreadId"]>;
}

/**
 * Between Continue (or a finished step) and the next launch the run is `running` while the
 * current step is still `pending`. The step before it is the one the run is waiting on; the
 * caller decides from that child's live shell whether it is still active.
 */
export function pipelineFeedingStep(
  run: PipelineRun,
  resolve: MFunctionType = mFallback,
): PipelineFeedingStep | null {
  if (run.status !== "running") return null;
  const current = run.steps[run.currentStepIndex];
  if (current === undefined || current.status !== "pending" || run.currentStepIndex === 0) {
    return null;
  }
  const feeding = run.steps[run.currentStepIndex - 1];
  if (feeding === undefined || feeding.childThreadId === null) return null;
  return {
    index: feeding.index,
    name: stepName(run, feeding.index, resolve),
    childThreadId: feeding.childThreadId,
  };
}

/** Whether the step is the one working right now, so feedback belongs in its own thread. */
function pipelineStepIsWorking(run: PipelineRun, stepIndex: number): boolean {
  return (
    run.status === "running" &&
    run.currentStepIndex === stepIndex &&
    run.steps[stepIndex]?.status === "running"
  );
}

export interface PipelineFeedbackRoute {
  readonly stepIndex: number;
  readonly name: string;
  readonly disabled: boolean;
  readonly hint: string | null;
}

/**
 * The steps feedback can be sent to directly: every step `revise` allows, plus the working step
 * as a disabled entry that points the user at its own thread.
 */
export function pipelineFeedbackRoutes(
  run: PipelineRun,
  resolve: MFunctionType = mFallback,
): ReadonlyArray<PipelineFeedbackRoute> {
  const actions = availablePipelineActions(run);
  const routes: PipelineFeedbackRoute[] = [];
  for (const step of run.steps) {
    const name = stepName(run, step.index, resolve);
    if (actions.revise(step.index)) {
      routes.push({ stepIndex: step.index, name, disabled: false, hint: null });
    } else if (pipelineStepIsWorking(run, step.index)) {
      routes.push({
        stepIndex: step.index,
        name,
        disabled: true,
        hint: resolve(msg("Message this step directly")),
      });
    }
  }
  return routes;
}

const REVISION_AUTHOR_LABELS: Record<PipelineRun["revisions"][number]["author"], string> = {
  user: msg("You", { $context: "author of a pipeline revision" }),
  coordinator: msg("Coordinator", { $context: "author of a pipeline revision" }),
  agent: msg("Agent", { $context: "author of a pipeline revision" }),
};

export function pipelineRevisionAuthorLabel(
  author: PipelineRun["revisions"][number]["author"],
  resolve: MFunctionType = mFallback,
): string {
  return resolve(REVISION_AUTHOR_LABELS[author]);
}

export interface CoordinatorFeedbackInput {
  /** The quoted text the feedback is about. */
  readonly quote: string;
  readonly sourceStepName: string;
  /** The source step's thread, as a markdown thread link the coordinator can name. */
  readonly sourceStepLink: string;
  readonly note: string;
}

/**
 * The message "Send feedback → Coordinator decides" posts to the run's coordinator: a blockquote,
 * the step it came from, then the user's note. The coordinator's instructions rely on this shape.
 */
export function buildCoordinatorFeedbackMessage(input: CoordinatorFeedbackInput): string {
  const quoted = input.quote
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  // oxlint-disable-next-line t3code/no-untranslated-copy -- sent to the coordinator agent, which parses this shape
  return `${quoted}\n\nFrom step ${input.sourceStepName} (${input.sourceStepLink})\n\n${input.note.trim()}`;
}

const FEEDBACK_EXCERPT_CHARS = 600;

/** A message's text trimmed to a quotable excerpt. */
export function feedbackQuoteExcerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= FEEDBACK_EXCERPT_CHARS
    ? trimmed
    : `${trimmed.slice(0, FEEDBACK_EXCERPT_CHARS).trimEnd()}…`;
}

interface EscalationCandidateItem {
  readonly type: string;
  readonly id: string;
  readonly status?: string;
  readonly toolName?: string | null;
  readonly output?: unknown;
}

/**
 * Tells a step thread's view when the agent just handed a request to the run's coordinator.
 * Only a call seen in flight and then completed counts, so history, paging and a reload that
 * finds the call already done never open the coordinator. Switching threads, or a null key
 * while the thread is not on screen, starts over.
 */
export function createPipelineEscalationWatcher() {
  let watchedThreadKey: string | null = null;
  const inFlight = new Set<string>();
  return (
    threadKey: string | null,
    rows: ReadonlyArray<{ readonly item: EscalationCandidateItem }>,
  ): boolean => {
    if (threadKey !== watchedThreadKey) {
      watchedThreadKey = threadKey;
      inFlight.clear();
    }
    if (threadKey === null) return false;
    let escalated = false;
    for (const { item } of rows) {
      if (item.type !== "dynamic_tool") continue;
      const done =
        item.status === "completed" ||
        item.status === "failed" ||
        item.status === "cancelled" ||
        item.status === "interrupted";
      // Checked before the tool name so a long history costs one lookup per item.
      if (done && !inFlight.has(item.id)) continue;
      if (resolveT3McpToolId(item.toolName) !== "escalate_to_pipeline_coordinator") continue;
      if (!done) {
        inFlight.add(item.id);
        continue;
      }
      inFlight.delete(item.id);
      if (item.status === "completed" && !compactDynamicToolOutput(item.output)?.isError) {
        escalated = true;
      }
    }
    return escalated;
  };
}

/** A paused run's step waits on its own work, not the user, until that work looks stuck. */
export function pipelineRunNeedsAttention(
  run: Pick<PipelineRun, "status" | "pauseReason">,
  wait: PipelineStepWait | null,
): boolean {
  if (run.status !== "paused") return false;
  return !(
    run.pauseReason === "awaiting_handoff" &&
    (wait === "pull_request" || wait === "background_work")
  );
}

export interface PipelineNeedsYou {
  /** "<Step> needs you", or a more specific variant of it. */
  readonly text: string;
  /** The step's thread, or null when the run waits before a step that has no thread yet. */
  readonly threadId: ThreadId | null;
  readonly stepName: string;
  readonly stepIndex: number;
}

/**
 * What the run's overview leads with when it needs the user: the step `pipelineAttentionTargets`
 * picks, as the sidebar's badge does. `steps` are the run's step thread shells, oldest first.
 */
export function pipelineRunNeedsYou<T extends PipelineNestable & { readonly title: string }>(
  run: PipelineRun,
  steps: readonly T[],
  threadStatus: (step: T) => string,
  waitOf?: PipelineStepWaitOf<T>,
  stuckAfterHours?: number,
  resolve: MFunctionType = mFallback,
): PipelineNeedsYou | null {
  const { target } = pipelineAttentionTargets(
    {
      status: run.status,
      pauseReason: run.pauseReason,
      currentStepIndex: run.currentStepIndex,
      steps: run.steps.map((step) => ({
        stepId: step.stepId,
        name: stepName(run, step.index, resolve),
        status: step.status,
        childThreadId: step.childThreadId,
      })),
    },
    steps,
    threadStatus,
    waitOf,
  );
  if (target === null) {
    if (run.status === "paused" && run.pauseReason === "awaiting_continue") {
      const name = stepName(run, run.currentStepIndex, resolve);
      return {
        text: resolve(msg("Paused before {name}", { name })),
        threadId: null,
        stepName: name,
        stepIndex: run.currentStepIndex,
      };
    }
    return null;
  }
  const stepIndex =
    (
      run.steps.find((step) => step.childThreadId === target.id) ??
      run.steps.find((step) => step.stepId === target.pipeline?.stepId)
    )?.index ?? run.currentStepIndex;
  const name = stepName(run, stepIndex, resolve);
  const own = threadStatus(target);
  const pausedHere = run.status === "paused" && stepIndex === run.currentStepIndex;
  const text =
    own === "approval"
      ? resolve(msg("{name} is asking for approval", { name }))
      : own === "input"
        ? resolve(msg("{name} is asking for input", { name }))
        : own === "request"
          ? resolve(msg("{name} is waiting for your response", { name }))
          : pausedHere && run.pauseReason === "awaiting_handoff"
            ? waitOf?.(target) === "possibly_stuck"
              ? maybeStuckText(name, stuckAfterHours, resolve)
              : resolve(msg("{name} ended without handing off", { name }))
            : pausedHere && run.pauseReason === "step_failed"
              ? resolve(msg("{name} failed", { name }))
              : pausedHere && run.pauseReason === "step_stopped"
                ? resolve(msg("{name} stopped", { name }))
                : resolve(msg("{name} needs you", { name }));
  return { text, threadId: target.id, stepName: name, stepIndex };
}

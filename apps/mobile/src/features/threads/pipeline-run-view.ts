import type { PipelineRun, PipelineRunStep } from "@t3tools/contracts";
import {
  availablePipelineActions,
  pipelineStepIsWorking,
  stepName,
} from "@t3tools/client-runtime/pipeline-run-presentation";

export type PipelineStepTone = "active" | "success" | "danger" | "muted";

export function pipelineStepTone(status: PipelineRunStep["status"]): PipelineStepTone {
  switch (status) {
    case "running":
      return "active";
    case "completed":
      return "success";
    case "failed":
      return "danger";
    default:
      return "muted";
  }
}

export interface FeedbackRouteOption {
  readonly stepIndex: number;
  readonly name: string;
  readonly disabled: boolean;
  readonly hint: string | null;
}

/**
 * The steps feedback can be sent to directly: every step `revise` allows, plus the working step
 * as a disabled entry that points the user at its own thread.
 */
export function feedbackStepRoutes(run: PipelineRun): ReadonlyArray<FeedbackRouteOption> {
  const actions = availablePipelineActions(run);
  const options: FeedbackRouteOption[] = [];
  for (const step of run.steps) {
    const name = stepName(run, step.index);
    if (actions.revise(step.index)) {
      options.push({ stepIndex: step.index, name, disabled: false, hint: null });
    } else if (pipelineStepIsWorking(run, step.index)) {
      options.push({
        stepIndex: step.index,
        name,
        disabled: true,
        hint: "Message this step directly",
      });
    }
  }
  return options;
}

/** The feedback history of one step, oldest first. */
export function stepRevisions(run: PipelineRun, stepIndex: number): PipelineRun["revisions"] {
  return run.revisions.filter((revision) => revision.stepIndex === stepIndex);
}

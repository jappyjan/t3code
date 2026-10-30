import { stepName } from "@t3tools/client-runtime/pipeline-run-presentation";
import { availablePipelineActions } from "@t3tools/client-runtime/pipeline-run-presentation";
import type { EnvironmentId, PipelineRun } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Radio, RadioGroup } from "../ui/radio-group";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Textarea } from "../ui/textarea";
import { getComposerPromptLengthValidationMessage } from "./composerSubmission";
import { usePipelineRevise } from "./usePipelineRevise";

const COORDINATOR_ROUTE = "coordinator";

/**
 * Feedback on a quoted excerpt from a step's thread. "Coordinator decides" posts it to the run's
 * coordinator chat; a step receives it directly, bypassing the coordinator.
 */
export function PipelineMessageFeedbackDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly run: PipelineRun;
  /** The step whose thread the quote came from. */
  readonly sourceStepId: string;
  readonly quote: string;
  readonly onClose: () => void;
  /** Posts to the coordinator chat; resolves false when it could not be sent. */
  readonly onSendToCoordinator: (note: string) => Promise<boolean>;
}) {
  const { run } = props;
  const { canRevise, revise } = usePipelineRevise(props.environmentId);
  const actions = availablePipelineActions(run);
  const [route, setRoute] = useState(COORDINATOR_ROUTE);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const sourceStep = run.steps.find((step) => step.stepId === props.sourceStepId);
  const lengthMessage = getComposerPromptLengthValidationMessage(note);

  const submit = async () => {
    if (sending || note.trim() === "" || lengthMessage !== null) return;
    setSending(true);
    let sent: boolean;
    if (route === COORDINATOR_ROUTE) {
      sent = await props.onSendToCoordinator(note);
    } else {
      const stepIndex = Number(route);
      const revised = await revise({
        runId: run.id,
        stepIndex,
        feedback: note,
        quote: props.quote,
        ...(sourceStep === undefined ? {} : { sourceStepId: sourceStep.stepId }),
      });
      sent = revised !== null;
      if (sent) {
        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: `Feedback sent to ${stepName(run, stepIndex)}`,
            description: "It fixes its work, then the later steps redo theirs.",
          }),
        );
      }
    }
    setSending(false);
    if (sent) props.onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Let the coordinator route it, or send it to one step. Later steps redo their work.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              <blockquote className="m-0 max-h-32 overflow-y-auto border-s-2 border-border ps-2 text-xs whitespace-pre-wrap text-muted-foreground">
                {props.quote}
              </blockquote>
              <Textarea
                autoFocus
                aria-label="Note"
                placeholder="What should change?"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
              />
              {lengthMessage === null ? null : (
                <p className="text-xs text-destructive-foreground" role="alert">
                  {lengthMessage}
                </p>
              )}
              <RadioGroup
                aria-label="Send to"
                value={route}
                onValueChange={(value) => setRoute(String(value))}
              >
                <label className="flex items-center gap-2 text-sm">
                  <Radio value={COORDINATOR_ROUTE} />
                  Coordinator decides
                </label>
                {run.steps.map((step) => {
                  const eligible = actions.revise(step.index);
                  const working =
                    !eligible && step.index === run.currentStepIndex && step.status === "running";
                  return (
                    <label
                      key={step.index}
                      className="flex items-center gap-2 text-sm aria-disabled:opacity-50"
                      aria-disabled={!eligible || !canRevise}
                    >
                      <Radio value={String(step.index)} disabled={!eligible || !canRevise} />
                      <span className="min-w-0 truncate">{stepName(run, step.index)}</span>
                      {working ? (
                        <span className="text-xs text-muted-foreground">
                          Message this step directly
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sending || note.trim() === "" || lengthMessage !== null}
            >
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

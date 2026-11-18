import { stepName } from "@t3tools/client-runtime/pipeline-run-presentation";
import type { EnvironmentId, PipelineRun } from "@t3tools/contracts";
import { T, useGT, useMessages, Var } from "gt-react";
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
import { Textarea } from "../ui/textarea";
import { getComposerPromptLengthValidationMessage } from "./composerSubmission";
import { usePipelineRevise } from "./usePipelineRevise";

/** Feedback for one earlier step: it fixes its work, then every later step redoes theirs. */
export function PipelineFeedbackDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly run: PipelineRun;
  readonly stepIndex: number;
  readonly onClose: () => void;
  readonly onRevised: (run: PipelineRun) => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const { run, stepIndex } = props;
  const { canRevise, revise } = usePipelineRevise(props.environmentId);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const name = stepName(run, stepIndex, m);
  const lengthMessage = getComposerPromptLengthValidationMessage(feedback);
  const laterRunning =
    run.status === "running" && run.currentStepIndex > stepIndex && run.steps.length > stepIndex;

  const submit = async () => {
    if (sending || feedback.trim() === "" || lengthMessage !== null) return;
    setSending(true);
    const revised = await revise({ runId: run.id, stepIndex, feedback });
    setSending(false);
    if (revised !== null) {
      props.onRevised(revised);
      props.onClose();
    }
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
            <DialogTitle>
              <T>
                Send feedback to <Var>{name}</Var>
              </T>
            </DialogTitle>
            <DialogDescription>
              <T>
                <Var>{name}</Var> fixes its work in its own thread, then every later step redoes its
                work.
              </T>
              {laterRunning ? ` ${gt("The step that is running now is stopped first.")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Textarea
              autoFocus
              aria-label={gt("Feedback")}
              placeholder={gt("What should change?")}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={5}
            />
            {lengthMessage === null ? null : (
              <p className="mt-2 text-xs text-destructive-foreground" role="alert">
                {lengthMessage}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              <T>Cancel</T>
            </Button>
            <Button
              type="submit"
              disabled={!canRevise || sending || feedback.trim() === "" || lengthMessage !== null}
            >
              <T>Send feedback</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

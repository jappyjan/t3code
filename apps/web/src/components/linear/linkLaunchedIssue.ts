import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { issueLinkInput, type LinearDraftIssue } from "@t3tools/client-runtime/linear/launch";
import { runAtomCommand, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { threadEnvironment } from "../../state/threads";
import { toastManager } from "../ui/toast";

/**
 * Links a thread started from an issue to it, as the issue panel's own link button does. A
 * failure only warns: the launch itself already happened.
 */
export async function linkLaunchedIssue(input: {
  readonly environmentId: EnvironmentId;
  readonly issue: LinearDraftIssue;
  readonly threadId: ThreadId;
  /** The thread's project on its machine; defaults to the project the issue was read through. */
  readonly projectId?: ProjectId;
}): Promise<void> {
  const result = await runAtomCommand(
    appAtomRegistry,
    threadEnvironment.linkIssue,
    {
      environmentId: input.environmentId,
      input: issueLinkInput({
        issue: input.issue,
        threadId: input.threadId,
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      }),
    },
    { label: "link launched issue", reportFailure: false, reportDefect: false },
  );
  if (result._tag === "Failure") {
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "warning",
      title: `Could not link ${input.issue.identifier} to the new thread`,
      description: failure instanceof Error ? failure.message : "The server refused it.",
    });
  }
}

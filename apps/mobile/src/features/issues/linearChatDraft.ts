import {
  buildLinearChatLaunchPlan,
  type LinearLaunchWorkspace,
} from "@t3tools/client-runtime/linear/launch";
import type { EnvironmentId, IssueDetail } from "@t3tools/contracts";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";

import {
  createNewTaskDraft,
  setComposerDraftContext,
  setComposerDraftText,
  updateComposerDraftSettings,
  waitForComposerDraftsLoaded,
} from "../../state/use-composer-drafts";
import { linearDraftWorkspaceSelection } from "./linearLaunchHelpers";

/**
 * Creates the new-task draft for an issue in the project it was read through: the issue chip,
 * the prompt, the workspace, and the issue to link once the task is sent.
 */
export async function createLinearChatDraft(input: {
  readonly environmentId: EnvironmentId;
  readonly detail: IssueDetail;
  readonly workspace: LinearLaunchWorkspace;
}): Promise<string> {
  const plan = buildLinearChatLaunchPlan({
    detail: input.detail,
    workspace: input.workspace,
    formatReference: formatComposerContextReference,
  });
  await waitForComposerDraftsLoaded();
  const draftKey = createNewTaskDraft({
    environmentId: input.environmentId,
    projectId: input.detail.projectId,
  });
  // Text first: setting it drops any context the text does not reference yet.
  setComposerDraftText(draftKey, plan.prompt);
  setComposerDraftContext(draftKey, { version: 1, records: [plan.record] });
  updateComposerDraftSettings(draftKey, {
    workspaceSelection: linearDraftWorkspaceSelection(plan.workspace),
    linearIssue: plan.draftIssue,
  });
  return draftKey;
}

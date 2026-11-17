import {
  attachedLinearDraftIssue,
  type LinearChatLaunchPlan,
} from "@t3tools/client-runtime/linear/launch";

import type {
  ComposerDraft,
  ComposerDraftWorkspaceSelection,
} from "../../state/use-composer-drafts";

export function linearDraftWorkspaceSelection(
  workspace: LinearChatLaunchPlan["workspace"],
): ComposerDraftWorkspaceSelection {
  return workspace.envMode === "worktree"
    ? { mode: "worktree", branch: workspace.branch, worktreePath: null }
    : { mode: "local", branch: null, worktreePath: null, followsCurrentCheckout: true };
}

/**
 * What a new task sent from a draft carries for its issue: the issue to link and the worktree
 * branch the tracker names. Nothing once the issue's chip is removed.
 */
export function linearThreadCreationFields(
  draft: Pick<ComposerDraft, "linearIssue" | "context">,
  workspaceMode: ComposerDraftWorkspaceSelection["mode"],
) {
  const linearIssue = attachedLinearDraftIssue(draft.linearIssue, draft.context?.records ?? []);
  if (linearIssue === null) return {};
  return {
    linearIssue,
    ...(workspaceMode === "worktree" && linearIssue.branchName.length > 0
      ? { worktreeBranchName: linearIssue.branchName }
      : {}),
  };
}

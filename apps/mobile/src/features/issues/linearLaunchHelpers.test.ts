import type { ComposerContextRecord } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { linearDraftWorkspaceSelection, linearThreadCreationFields } from "./linearLaunchHelpers";

const issue = {
  issueId: "ATT-612",
  identifier: "ATT-612",
  title: "Add retry",
  url: "https://linear.app/acme/issue/ATT-612",
  tracker: "linear",
  host: "linear.app",
  scope: "ATT",
  projectId: "project-1",
  branchName: "ada/att-612-add-retry",
};
const chip = { kind: "linear-issue", issueId: "ATT-612" } as ComposerContextRecord;
const other = { kind: "mention", path: "src/index.ts" } as ComposerContextRecord;

describe("linear launch helpers", () => {
  it("starts a worktree off the project's base and a local task on the current checkout", () => {
    expect(
      linearDraftWorkspaceSelection({ envMode: "worktree", branch: null, worktreePath: null }),
    ).toEqual({ mode: "worktree", branch: null, worktreePath: null });
    expect(
      linearDraftWorkspaceSelection({ envMode: "local", branch: null, worktreePath: null }),
    ).toEqual({ mode: "local", branch: null, worktreePath: null, followsCurrentCheckout: true });
  });

  it("links and branches a new task only while its issue chip is attached", () => {
    const attached = { linearIssue: issue, context: { version: 1 as const, records: [chip] } };
    expect(linearThreadCreationFields(attached, "worktree")).toEqual({
      linearIssue: issue,
      worktreeBranchName: "ada/att-612-add-retry",
    });
    expect(linearThreadCreationFields(attached, "local")).toEqual({ linearIssue: issue });
    expect(
      linearThreadCreationFields(
        { linearIssue: { ...issue, branchName: "" }, context: attached.context },
        "worktree",
      ),
    ).toEqual({ linearIssue: { ...issue, branchName: "" } });
    expect(
      linearThreadCreationFields(
        { linearIssue: issue, context: { version: 1, records: [other] } },
        "worktree",
      ),
    ).toEqual({});
  });
});

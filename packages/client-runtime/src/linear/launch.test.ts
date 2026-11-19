import type { ComposerContextRecord, IssueDetail, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  attachedLinearDraftIssue,
  draftIssueOf,
  issueLinkInput,
  pipelineWorkspaceStrategy,
  resolveLaunchProject,
} from "./launch.ts";

const detail = {
  tracker: "linear",
  host: "linear.app",
  scope: "ENG",
  key: "ENG-7",
  displayKey: "ENG-7",
  title: "Handshake",
  url: "https://linear.app/acme/issue/ENG-7",
  projectId: "project-1",
  branchName: "eng/eng-7",
} as unknown as IssueDetail;

describe("linear launch", () => {
  it("links only while the issue chip is still attached", () => {
    const launch = draftIssueOf(detail);
    const chip = { kind: "linear-issue", issueId: "ENG-7" } as unknown as ComposerContextRecord;
    expect(attachedLinearDraftIssue(launch, [chip])).toBe(launch);
    expect(attachedLinearDraftIssue(launch, [])).toBeNull();
    expect(attachedLinearDraftIssue(null, [chip])).toBeNull();
  });

  it("links the thread through its own project, defaulting to the issue's", () => {
    const issue = draftIssueOf(detail);
    const threadId = "thread-1" as ThreadId;
    expect(issueLinkInput({ issue, threadId })).toEqual({
      threadId,
      tracker: "linear",
      host: "linear.app",
      scope: "ENG",
      key: "ENG-7",
      projectId: "project-1",
      url: "https://linear.app/acme/issue/ENG-7",
      displayKey: "ENG-7",
      title: "Handshake",
      source: "manual",
    });
    expect(issueLinkInput({ issue, threadId, projectId: "other" as never }).projectId).toBe(
      "other",
    );
  });

  it("starts a pipeline worktree on the issue's branch", () => {
    expect(
      pipelineWorkspaceStrategy({ workspace: "worktree", baseRef: "main", branchName: "eng/x" }),
    ).toEqual({ type: "worktree", baseRef: "main", branch: "eng/x", freeBranchName: true });
    expect(
      pipelineWorkspaceStrategy({ workspace: "worktree", baseRef: null, branchName: "" }),
    ).toEqual({ type: "worktree", baseRef: "HEAD" });
    expect(
      pipelineWorkspaceStrategy({ workspace: "local", baseRef: "main", branchName: "eng/x" }),
    ).toEqual({ type: "root" });
  });

  it("starts in the bound project, else a remembered one that still exists, else asks", () => {
    const [web, api] = ["web", "api"] as ProjectId[];
    const available = [web!, api!];
    expect(resolveLaunchProject({ bound: [api!], remembered: web, available })).toEqual({
      projectId: api,
      bound: true,
    });
    expect(
      resolveLaunchProject({ bound: ["gone" as ProjectId], remembered: web, available }),
    ).toEqual({ projectId: web, bound: false });
    expect(resolveLaunchProject({ bound: [], remembered: "gone", available })).toEqual({
      projectId: null,
      bound: false,
    });
  });
});

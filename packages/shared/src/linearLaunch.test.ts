import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS, type IssueDetail } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildLinearIssueContextRecord,
  buildLinearIssueMarkdown,
  issueStateType,
} from "./linearLaunch.ts";

const open = { category: "open", name: "Todo" } as const;
const done = { category: "closed", name: "Done", closeReason: "completed" } as const;
const canceled = { category: "closed", name: "Canceled", closeReason: "canceled" } as const;
const related = (key: string, state: IssueDetail["state"]) => ({
  key,
  displayKey: key,
  title: `Issue ${key}`,
  url: `https://linear.app/acme/issue/${key}`,
  state,
});

const detail = (overrides: Partial<IssueDetail> = {}): IssueDetail =>
  ({
    tracker: "linear",
    host: "linear.app",
    scope: "ENG",
    key: "ENG-7",
    displayKey: "ENG-7",
    title: "Handshake",
    url: "https://linear.app/acme/issue/ENG-7",
    author: null,
    state: { category: "open", name: "In Progress" },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    closedAt: null,
    assignees: [{ login: "theo", name: "Theo", avatarUrl: null }],
    labels: [{ name: "Bug", color: "#f00" }],
    commentCount: 0,
    projectId: "project-1",
    projectTitle: "web",
    writable: true,
    states: [],
    viewer: null,
    body: "The body",
    comments: [],
    commentsCursor: null,
    events: [],
    linkedPullRequests: [],
    branchName: "eng/eng-7-handshake",
    priorityLabel: "High",
    containers: [
      { kind: "project", id: "p", name: "Launch" },
      { kind: "milestone", id: "m", name: "Beta" },
    ],
    ...overrides,
  }) as IssueDetail;

describe("linear issue launch context", () => {
  it("snapshots the issue with open blockers first and the newest ten comments", () => {
    const comments = Array.from({ length: 12 }, (_, index) => ({
      id: `c${index}`,
      author: { login: "julius", name: null, avatarUrl: null },
      body: `comment ${index}`,
      createdAt: `2026-07-0${(index % 9) + 1}T00:00:00.000Z`,
      url: null,
    }));
    const record = buildLinearIssueContextRecord(
      detail({
        comments,
        subIssues: [related("ENG-8", done), related("ENG-9", open)],
        blockedBy: [related("ENG-2", canceled), related("ENG-3", open)],
      }),
    );
    expect(record).toMatchObject({
      kind: "linear-issue",
      issueId: "ENG-7",
      identifier: "ENG-7",
      teamName: "ENG",
      projectName: "Launch",
      milestoneName: "Beta",
      stateType: "open",
      assigneeName: "Theo",
      branchName: "eng/eng-7-handshake",
    });
    expect(record.blockedBy?.map((blocker) => [blocker.identifier, blocker.stateType])).toEqual([
      ["ENG-3", "open"],
      ["ENG-2", "canceled"],
    ]);
    expect(record.subIssues.map((sub) => sub.stateType)).toEqual(["completed", "open"]);
    expect(record.comments.map((comment) => comment.body)).toEqual(
      comments.slice(-10).map((comment) => comment.body),
    );
  });

  it("renders markdown for a pipeline within the provider's input limit", () => {
    const markdown = buildLinearIssueMarkdown(
      detail({ subIssues: [related("ENG-8", done)], blockedBy: [related("ENG-3", open)] }),
    );
    expect(markdown).toContain("# ENG-7 · Handshake");
    expect(markdown).toContain("ENG · Launch · Beta · High · In Progress");
    expect(markdown).toContain("- Branch: eng/eng-7-handshake");
    expect(markdown).toContain("## Blocked by\n\n- [ ] ENG-3 Issue ENG-3");
    expect(markdown).toContain("## Sub-issues\n\n- [x] ENG-8 Issue ENG-8");

    const huge = buildLinearIssueMarkdown(
      detail({
        comments: Array.from({ length: 10 }, (_, index) => ({
          id: `c${index}`,
          author: null,
          body: "x".repeat(50_000),
          createdAt: "2026-07-01T00:00:00.000Z",
          url: null,
        })),
        body: "y".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS),
      }),
    );
    expect(huge.length).toBeLessThanOrEqual(PROVIDER_SEND_TURN_MAX_INPUT_CHARS);
  });

  it("names a closed state by how it closed", () => {
    expect([open, done, canceled].map(issueStateType)).toEqual(["open", "completed", "canceled"]);
  });
});

import {
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type IssueDetail,
  type IssueRelatedRef,
  type IssueState,
  type LinearIssueContextRecord,
} from "@t3tools/contracts";

import {
  sanitizeComposerContextLabel,
  toKindScopedComposerContextId,
} from "./composerContextReferences.ts";
import { formatLinearIssueMarkdown, type LinearIssueSnapshot } from "./linearIssueMarkdown.ts";

/** Limits for what an agent reads about one issue. Mirrors the contract record's bounds. */
const DESCRIPTION_MAX_CHARS = 16_000;
const SUB_ISSUES_MAX = 50;
const BLOCKERS_MAX = 20;
const COMMENTS_MAX = 10;
const COMMENT_MAX_CHARS = 2_000;
const LABELS_MAX = 50;
const LINKED_PRS_MAX = 20;
const SHORT_MAX_CHARS = 2_048;

const DESCRIPTION_TRUNCATION_MARKER = "\n\n[description truncated]";
const COMMENT_TRUNCATION_MARKER = " [comment truncated]";
const INPUT_TRUNCATION_NOTE =
  "\n\n[The rest of this issue was left out: it exceeds the input size limit.]";

/**
 * Linear's workflow type where the tracker reports one (the chip draws its glyph), otherwise
 * `completed`, `canceled` (any other way of closing) or `open`. The checkboxes key off it.
 */
export function issueStateType(state: IssueState): string {
  if (state.type !== undefined) return state.type;
  if (state.category === "open") return "open";
  return state.closeReason === "completed" ? "completed" : "canceled";
}

function clip(value: string, max: number, marker = ""): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - marker.length))}${marker}`;
}

const clipShort = (value: string) => clip(value, SHORT_MAX_CHARS);

/** Open blockers first so the ones that matter lead; order is otherwise preserved. */
export function sortBlockers(blockers: ReadonlyArray<IssueRelatedRef>): IssueRelatedRef[] {
  const open = (ref: IssueRelatedRef) => ref.state.category === "open";
  return [...blockers.filter(open), ...blockers.filter((ref) => !open(ref))];
}

/** Frozen copy of the issue for the agent: later tracker edits do not change what it reads. */
function buildSnapshot(detail: IssueDetail): LinearIssueSnapshot {
  const container = (kind: "project" | "milestone") =>
    detail.containers?.find((entry) => entry.kind === kind)?.name ?? null;
  return {
    issueId: clip(detail.key, 255),
    identifier: clip(detail.displayKey, 64),
    title: clipShort(detail.title),
    url: clipShort(detail.url),
    teamName: clipShort(detail.scope),
    projectName: container("project"),
    milestoneName: container("milestone"),
    stateName: clipShort(detail.state.name),
    stateType: issueStateType(detail.state),
    priorityLabel: clipShort(detail.priorityLabel ?? ""),
    assigneeName: detail.assignees[0]
      ? clipShort(detail.assignees[0].name ?? detail.assignees[0].login)
      : null,
    labels: detail.labels.slice(0, LABELS_MAX).map((label) => clipShort(label.name)),
    branchName: clipShort(detail.branchName ?? ""),
    description: clip(detail.body, DESCRIPTION_MAX_CHARS, DESCRIPTION_TRUNCATION_MARKER),
    blockedBy: sortBlockers(detail.blockedBy ?? [])
      .slice(0, BLOCKERS_MAX)
      .map((blocker) => ({
        identifier: clipShort(blocker.displayKey),
        title: clipShort(blocker.title),
        stateType: issueStateType(blocker.state),
      })),
    subIssues: (detail.subIssues ?? []).slice(0, SUB_ISSUES_MAX).map((sub) => ({
      identifier: clipShort(sub.displayKey),
      title: clipShort(sub.title),
      stateType: issueStateType(sub.state),
    })),
    // The detail holds the oldest comments first; keep the newest ones in that order.
    comments: detail.comments.slice(-COMMENTS_MAX).map((comment) => ({
      author: comment.author ? clipShort(comment.author.name ?? comment.author.login) : null,
      createdAt: clipShort(comment.createdAt),
      body: clip(comment.body, COMMENT_MAX_CHARS, COMMENT_TRUNCATION_MARKER),
    })),
    linkedPullRequests: detail.linkedPullRequests
      .slice(0, LINKED_PRS_MAX)
      .map((pr) => clipShort(`${pr.repository}#${pr.number} (${pr.state}) ${pr.url}`)),
  };
}

export function buildLinearIssueContextRecord(detail: IssueDetail): LinearIssueContextRecord {
  const snapshot = buildSnapshot(detail);
  return {
    version: 1,
    kind: "linear-issue",
    contextId: toKindScopedComposerContextId("linear-issue", snapshot.issueId),
    label: sanitizeComposerContextLabel(
      `${snapshot.identifier} · ${snapshot.title}`,
      "linear-issue",
    ),
    ...snapshot,
  };
}

/** Text-only rendering of an issue for a pipeline's first step, within the provider input limit. */
export function buildLinearIssueMarkdown(detail: IssueDetail): string {
  const text = formatLinearIssueMarkdown(buildSnapshot(detail));
  if (text.length <= PROVIDER_SEND_TURN_MAX_INPUT_CHARS) return text;
  return `${text.slice(0, PROVIDER_SEND_TURN_MAX_INPUT_CHARS - INPUT_TRUNCATION_NOTE.length)}${INPUT_TRUNCATION_NOTE}`;
}

/** The composer text a launch starts from; the issue itself travels as attached context. */
export function buildLinearIssuePrompt(issue: Pick<IssueDetail, "displayKey" | "title">): string {
  return [
    `Implement ${issue.displayKey}: ${issue.title}.`,
    "Read the attached issue, its sub-issues and comments first.",
    "When done, open a PR. Keep the branch name so Linear links it.",
  ].join("\n\n");
}

/** "+ 3 sub-issues, 2 comments", or null when the snapshot carries neither. */
export function linearIssueExtrasSummary(record: {
  readonly subIssues: { readonly length: number };
  readonly comments: { readonly length: number };
}): string | null {
  const count = (n: number, noun: string) => (n > 0 ? `${n} ${noun}${n === 1 ? "" : "s"}` : null);
  const parts = [
    count(record.subIssues.length, "sub-issue"),
    count(record.comments.length, "comment"),
  ];
  const present = parts.filter((part): part is string => part !== null);
  return present.length === 0 ? null : `+ ${present.join(", ")}`;
}

export function formatTokenEstimate(chars: number): string {
  const tokens = Math.ceil(Math.max(0, chars) / 4);
  if (tokens < 1_000) return `~${tokens} tokens`;
  return `~${(Math.round(tokens / 100) / 10).toFixed(1)}k tokens`;
}

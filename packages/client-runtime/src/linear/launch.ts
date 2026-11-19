import {
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type ComposerContextRecord,
  type EnvironmentId,
  type IssueDetail,
  type IssueRef,
  type IssueTrackerKind,
  type OrchestrationV2ThreadLaunchWorkspaceStrategy,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import {
  buildLinearIssueContextRecord,
  buildLinearIssueMarkdown,
  buildLinearIssuePrompt,
  formatTokenEstimate,
} from "@t3tools/shared/linearLaunch";
import * as Schema from "effect/Schema";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";

export type LinearLaunchWorkspace = "worktree" | "local";

/** Launches are offered for trackers whose detail names a branch: Linear today. */
export function canLaunchFromIssue(detail: Pick<IssueDetail, "tracker">): boolean {
  return detail.tracker === "linear";
}

/**
 * A draft started from an issue: what to link once it is sent. The issue reference is the one
 * the Issues page read it through, so the link opens the same issue again.
 */
export const LinearDraftIssue = Schema.Struct({
  /** The context record's `issueId`, which is the issue key. */
  issueId: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  url: Schema.String,
  tracker: Schema.String,
  host: Schema.String,
  scope: Schema.String,
  projectId: Schema.String,
  /** The tracker's branch name; the new worktree takes it, with a free `-2` suffix if taken. */
  branchName: Schema.String,
});
export type LinearDraftIssue = typeof LinearDraftIssue.Type;

export function draftIssueOf(detail: IssueDetail): LinearDraftIssue {
  return {
    issueId: detail.key,
    identifier: detail.displayKey,
    title: detail.title,
    url: detail.url,
    tracker: detail.tracker,
    host: detail.host,
    scope: detail.scope,
    projectId: detail.projectId,
    branchName: detail.branchName ?? "",
  };
}

/** A draft's launch counts only while its issue is still attached; removing the chip opts out. */
export function attachedLinearDraftIssue<Launch extends Pick<LinearDraftIssue, "issueId">>(
  launch: Launch | null | undefined,
  records: ReadonlyArray<ComposerContextRecord>,
): Launch | null {
  if (!launch) return null;
  return records.some(
    (record) =>
      record.kind === "linear-issue" && "issueId" in record && record.issueId === launch.issueId,
  )
    ? launch
    : null;
}

/**
 * The `linkIssue` command input that ties a new thread to the issue. `projectId` is the thread's
 * own project on its machine, which reads the issue when the link is opened there.
 */
export function issueLinkInput(input: {
  readonly issue: LinearDraftIssue;
  readonly threadId: ThreadId;
  readonly projectId?: ProjectId;
}) {
  const { issue } = input;
  return {
    threadId: input.threadId,
    tracker: issue.tracker as IssueRef["tracker"],
    host: issue.host,
    scope: issue.scope,
    key: issue.issueId,
    projectId: input.projectId ?? (issue.projectId as ProjectId),
    url: issue.url,
    displayKey: issue.identifier,
    title: issue.title,
    source: "manual" as const,
  };
}

/** Where a chat from an issue starts: a new worktree off the project's base, or the checkout. */
function resolveLinearChatWorkspace(workspace: LinearLaunchWorkspace) {
  return workspace === "worktree"
    ? ({ envMode: "worktree", branch: null, worktreePath: null } as const)
    : ({ envMode: "local", branch: null, worktreePath: null } as const);
}

/**
 * Everything a chat started from an issue needs: the attached context record, where it runs, the
 * prompt, and the draft record. `formatReference` renders the client's inline chip for the record.
 */
export function buildLinearChatLaunchPlan(input: {
  readonly detail: IssueDetail;
  readonly workspace: LinearLaunchWorkspace;
  readonly formatReference: (record: ReturnType<typeof buildLinearIssueContextRecord>) => string;
}) {
  const record = buildLinearIssueContextRecord(input.detail);
  return {
    record,
    workspace: resolveLinearChatWorkspace(input.workspace),
    prompt: `${input.formatReference(record)}\n\n${buildLinearIssuePrompt(input.detail)}`,
    draftIssue: draftIssueOf(input.detail),
  };
}

export type LinearChatLaunchPlan = ReturnType<typeof buildLinearChatLaunchPlan>;

// ── Launch project ────────────────────────────────────────────────────────

/** Names a team's remembered launch project; team keys repeat across environments. */
export function launchProjectChoiceKey(
  environmentId: EnvironmentId,
  tracker: IssueTrackerKind,
  scope: string,
): string {
  return `${environmentId} ${tracker} ${scope.toLowerCase()}`;
}

/**
 * Where a launch from a team's issue starts: the project bound to the team, else the one picked
 * for it before on this device, while it still exists. Null asks.
 */
export function resolveLaunchProject(input: {
  readonly bound: ReadonlyArray<ProjectId>;
  readonly remembered: string | null | undefined;
  readonly available: ReadonlyArray<ProjectId>;
}): { readonly projectId: ProjectId | null; readonly bound: boolean } {
  const bound = input.bound.find((projectId) => input.available.includes(projectId));
  if (bound !== undefined) return { projectId: bound, bound: true };
  const remembered = input.available.find((projectId) => projectId === input.remembered);
  return { projectId: remembered ?? null, bound: false };
}

const LAUNCH_PROJECTS_KEY = "t3code:linear:launch-projects:v1";

export function readLaunchProjectChoice(
  storage: Pick<Storage, "getItem"> | undefined,
  key: string,
): string | null {
  try {
    const value = (
      JSON.parse(storage?.getItem(LAUNCH_PROJECTS_KEY) ?? "{}") as Record<string, unknown>
    )[key];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function writeLaunchProjectChoice(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  key: string,
  projectId: ProjectId,
): void {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(LAUNCH_PROJECTS_KEY) ?? "{}");
    const choices = typeof parsed === "object" && parsed !== null ? parsed : {};
    storage?.setItem(LAUNCH_PROJECTS_KEY, JSON.stringify({ ...choices, [key]: projectId }));
  } catch {
    // Remembering the pick is a convenience; the launch still asks next time.
  }
}

// ── Pipeline ──────────────────────────────────────────────────────────────

// Pipelines have a different id on every machine, so the last used one is remembered by name.
const LAST_USED_PIPELINE_KEY = "t3code:linear:last-pipeline-name:v1";

/** The pipeline last started from an issue on this device; null when none or storage fails. */
export function readLastUsedPipelineName(
  storage: Pick<Storage, "getItem"> | undefined,
): string | null {
  try {
    return storage?.getItem(LAST_USED_PIPELINE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastUsedPipelineName(
  storage: Pick<Storage, "setItem"> | undefined,
  pipelineName: string,
): void {
  try {
    storage?.setItem(LAST_USED_PIPELINE_KEY, pipelineName);
  } catch {
    // The "Last used" hint is a convenience; losing it must not block a launch.
  }
}

/** The text the first step receives. Text the person edited wins over the generated version. */
export function pipelineInputText(input: {
  readonly detail: IssueDetail;
  readonly edited: string | null;
}): string {
  return input.edited ?? buildLinearIssueMarkdown(input.detail);
}

/** Size of the input; `startable` when it is non-empty and within the limit. */
export function pipelineInputSummary(text: string, resolve: MFunctionType = mFallback) {
  const tokens = formatTokenEstimate(text.length);
  const overLimit = text.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS;
  return {
    tokens,
    overLimit,
    startable: text.trim().length > 0 && !overLimit,
    sizeLabel: overLimit
      ? resolve(msg("{tokens} · over the {limit} character limit"), {
          tokens,
          limit: PROVIDER_SEND_TURN_MAX_INPUT_CHARS.toLocaleString("en-US"),
        })
      : tokens,
  };
}

export function pipelineWorkspaceStrategy(input: {
  readonly workspace: LinearLaunchWorkspace;
  /** The project's current branch, when known. */
  readonly baseRef: string | null;
  readonly branchName: string;
}): OrchestrationV2ThreadLaunchWorkspaceStrategy {
  if (input.workspace === "local") return { type: "root" };
  // "HEAD" starts the worktree where the checkout is when no branch is known yet.
  return {
    type: "worktree",
    baseRef: input.baseRef ?? "HEAD",
    ...(input.branchName.length > 0 ? { branch: input.branchName, freeBranchName: true } : {}),
  };
}

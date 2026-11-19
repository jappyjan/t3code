import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  buildLinearChatLaunchPlan,
  canLaunchFromIssue,
  type LinearLaunchWorkspace,
} from "@t3tools/client-runtime/linear/launch";
import type {
  EnvironmentId,
  IssueDetail,
  IssueRelatedRef,
  LinearIssueContextRecord,
} from "@t3tools/contracts";
import { sortBlockers } from "@t3tools/shared/linearLaunch";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleIcon,
  CircleXIcon,
  FolderKanbanIcon,
  GitBranchIcon,
  MessageSquarePlusIcon,
  WorkflowIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { linearContextReference } from "../../lib/composerContextRecords";
import { formatInlineContextReference } from "../../lib/composerContextReferences";
import { PullRequestMetaRow } from "../pullRequest/PullRequestSummaryTab";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { LinearPipelineDialog } from "./LinearPipelineDialog";

const formatReference = (record: LinearIssueContextRecord) =>
  formatInlineContextReference(linearContextReference(record));

/**
 * Start chat and Run pipeline for an issue whose tracker names a branch. Both start in the
 * project the issue is read through: the one bound to its Linear team in Settings.
 */
export function LinearIssueLaunchBar({
  environmentId,
  detail,
}: {
  readonly environmentId: EnvironmentId;
  readonly detail: IssueDetail;
}) {
  const newThread = useNewThreadHandler();
  const [pipelineOpen, setPipelineOpen] = useState(false);
  if (!canLaunchFromIssue(detail)) return null;

  const startChat = async (workspace: LinearLaunchWorkspace) => {
    const plan = buildLinearChatLaunchPlan({ detail, workspace, formatReference });
    const opened = await newThread(scopeProjectRef(environmentId, detail.projectId), {
      ...plan.workspace,
      prompt: plan.prompt,
    }).catch(() => null);
    if (opened === null) {
      toastManager.add({
        type: "error",
        title: `Could not open a chat for ${detail.displayKey}`,
        description: "Try again from the project, or open a thread first.",
      });
      return;
    }
    const store = useComposerDraftStore.getState();
    store.addLinearContexts(opened.draftId, [plan.record], { appendReference: false });
    store.setDraftLinearIssue(opened.draftId, plan.draftIssue);
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Group>
        <Button size="sm" variant="outline" onClick={() => void startChat("worktree")}>
          <MessageSquarePlusIcon aria-hidden />
          Start chat
        </Button>
        <GroupSeparator />
        <Menu>
          <MenuTrigger
            render={<Button size="icon-sm" variant="outline" aria-label="More ways to start" />}
          >
            <ChevronDownIcon aria-hidden />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={() => void startChat("worktree")}>
              New worktree{detail.branchName ? ` · ${detail.branchName}` : ""}
            </MenuItem>
            <MenuItem onClick={() => void startChat("local")}>Local checkout</MenuItem>
          </MenuPopup>
        </Menu>
      </Group>
      <Button size="sm" variant="outline" onClick={() => setPipelineOpen(true)}>
        <WorkflowIcon aria-hidden />
        Run pipeline
      </Button>
      {pipelineOpen ? (
        <LinearPipelineDialog
          environmentId={environmentId}
          detail={detail}
          onClose={() => setPipelineOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RelatedStateIcon({ issue }: { readonly issue: IssueRelatedRef }) {
  const Icon =
    issue.state.category === "open"
      ? CircleIcon
      : issue.state.closeReason === "completed"
        ? CircleCheckIcon
        : CircleXIcon;
  return <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
}

function RelatedIssue({
  issue,
  onOpen,
}: {
  readonly issue: IssueRelatedRef;
  readonly onOpen: ((issue: IssueRelatedRef) => void) | undefined;
}) {
  const body = (
    <>
      <RelatedStateIcon issue={issue} />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.displayKey}</span>
      <span className="min-w-0 truncate">{issue.title}</span>
    </>
  );
  const className =
    "flex min-w-0 items-center gap-1.5 rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  return onOpen ? (
    <button type="button" className={className} onClick={() => onOpen(issue)}>
      {body}
    </button>
  ) : (
    <a className={className} href={issue.url} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  );
}

function RelatedList({
  issues,
  onOpen,
}: {
  readonly issues: ReadonlyArray<IssueRelatedRef>;
  readonly onOpen: ((issue: IssueRelatedRef) => void) | undefined;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {issues.map((issue) => (
        <RelatedIssue key={issue.key} issue={issue} onOpen={onOpen} />
      ))}
    </span>
  );
}

/** Project, milestone, branch, parent and relations, for trackers that report them. */
export function LinearIssueRelations({
  detail,
  onOpenIssue,
}: {
  readonly detail: IssueDetail;
  /** Opens a related issue beside this one; absent, the link goes to the tracker. */
  readonly onOpenIssue?: ((issue: IssueRelatedRef) => void) | undefined;
}) {
  const rows: Array<{ key: string; icon: ReactNode; label: string; value: ReactNode }> = [];
  const containers = detail.containers ?? [];
  if (containers.length > 0) {
    rows.push({
      key: "project",
      icon: <FolderKanbanIcon className="size-3.5" />,
      label: "Project",
      value: (
        <span className="min-w-0 truncate">
          {containers.map((container) => container.name).join(" › ")}
        </span>
      ),
    });
  }
  if (detail.branchName) {
    rows.push({
      key: "branch",
      icon: <GitBranchIcon className="size-3.5" />,
      label: "Branch",
      value: <span className="min-w-0 truncate font-mono text-xs">{detail.branchName}</span>,
    });
  }
  const groups: Array<[string, ReadonlyArray<IssueRelatedRef>]> = [
    ["Parent", detail.parent ? [detail.parent] : []],
    ["Sub-issues", detail.subIssues ?? []],
    ["Blocked by", sortBlockers(detail.blockedBy ?? [])],
    ["Blocking", detail.blocks ?? []],
  ];
  for (const [label, issues] of groups) {
    if (issues.length === 0) continue;
    rows.push({
      key: label,
      icon: <CircleIcon className="size-3.5" />,
      label,
      value: <RelatedList issues={issues} onOpen={onOpenIssue} />,
    });
  }
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {rows.map((row) => (
        <PullRequestMetaRow key={row.key} icon={row.icon} label={row.label}>
          {row.value}
        </PullRequestMetaRow>
      ))}
    </div>
  );
}

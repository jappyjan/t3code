import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { projectsBoundToScope } from "@t3tools/client-runtime/issue-browse";
import {
  buildLinearChatLaunchPlan,
  canLaunchFromIssue,
  launchProjectChoiceKey,
  readLaunchProjectChoice,
  resolveLaunchProject,
  writeLaunchProjectChoice,
  type LinearLaunchWorkspace,
} from "@t3tools/client-runtime/linear/launch";
import type {
  EnvironmentId,
  IssueDetail,
  IssueRelatedRef,
  LinearIssueContextRecord,
  ProjectId,
} from "@t3tools/contracts";
import { sortBlockers } from "@t3tools/shared/linearLaunch";
import {
  ChevronDownIcon,
  BanIcon,
  ListTreeIcon,
  OctagonAlertIcon,
  CornerLeftUpIcon,
  FolderKanbanIcon,
  GitBranchIcon,
  SignalIcon,
  MessageSquarePlusIcon,
  WorkflowIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useProjects } from "../../state/entities";
import { issueTrackerEnvironment } from "../../state/issueTrackers";
import { useEnvironmentQuery } from "../../state/query";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { linearContextReference } from "../../lib/composerContextRecords";
import { formatInlineContextReference } from "../../lib/composerContextReferences";
import { IssueStateIcon } from "../issue/issuePresentation";
import { PullRequestMetaRow } from "../pullRequest/PullRequestSummaryTab";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { LinearPipelineDialog } from "./LinearPipelineDialog";

const formatReference = (record: LinearIssueContextRecord) =>
  formatInlineContextReference(linearContextReference(record));

/**
 * Start chat and Run pipeline for an issue whose tracker names a branch. Both start in the
 * project bound to its Linear team in Settings; for an unbound team the bar asks for a project
 * and remembers the pick for the team on this device.
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
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const bindings =
    useEnvironmentQuery(issueTrackerEnvironment.connections({ environmentId, input: {} })).data
      ?.bindings ?? {};
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const choiceKey = launchProjectChoiceKey(environmentId, detail.tracker, detail.scope);
  const [picked, setPicked] = useState<string | null>(() =>
    readLaunchProjectChoice(storage, choiceKey),
  );
  if (!canLaunchFromIssue(detail)) return null;

  const target = resolveLaunchProject({
    bound: projectsBoundToScope(bindings, detail.tracker, detail.scope),
    remembered: picked,
    available: projects.map((project) => project.id),
  });
  const launchDetail =
    target.projectId === null ? null : { ...detail, projectId: target.projectId };
  const pick = (projectId: ProjectId) => {
    setPicked(projectId);
    writeLaunchProjectChoice(storage, choiceKey, projectId);
  };

  const startChat = async (workspace: LinearLaunchWorkspace) => {
    if (launchDetail === null) return;
    const plan = buildLinearChatLaunchPlan({ detail: launchDetail, workspace, formatReference });
    const opened = await newThread(scopeProjectRef(environmentId, launchDetail.projectId), {
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
      {target.bound ? null : (
        <Select
          value={target.projectId ?? ""}
          onValueChange={(next) => {
            if (next) pick(next as ProjectId);
          }}
        >
          <SelectTrigger aria-label="Project to start in" className="w-48" size="sm">
            <SelectValue>
              {projects.find((project) => project.id === target.projectId)?.title ??
                "Choose a project"}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      )}
      <Group>
        <Button
          size="sm"
          variant="outline"
          disabled={launchDetail === null}
          onClick={() => void startChat("worktree")}
        >
          <MessageSquarePlusIcon aria-hidden />
          Start chat
        </Button>
        <GroupSeparator />
        <Menu>
          <MenuTrigger
            disabled={launchDetail === null}
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
      <Button
        size="sm"
        variant="outline"
        disabled={launchDetail === null}
        onClick={() => setPipelineOpen(true)}
      >
        <WorkflowIcon aria-hidden />
        Run pipeline
      </Button>
      {pipelineOpen && launchDetail !== null ? (
        <LinearPipelineDialog
          environmentId={environmentId}
          detail={launchDetail}
          onClose={() => setPipelineOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RelatedStateIcon({ issue }: { readonly issue: IssueRelatedRef }) {
  return <IssueStateIcon state={issue.state} className="size-3.5" />;
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
  if (detail.priorityLabel) {
    rows.push({
      key: "priority",
      icon: <SignalIcon className="size-3.5" />,
      label: "Priority",
      value: <span className="min-w-0 truncate">{detail.priorityLabel}</span>,
    });
  }
  // None of these may be a circle: the related issues' own status glyphs are circles.
  const groups: Array<[string, ReactNode, ReadonlyArray<IssueRelatedRef>]> = [
    [
      "Parent",
      <CornerLeftUpIcon key="parent" className="size-3.5" />,
      detail.parent ? [detail.parent] : [],
    ],
    ["Sub-issues", <ListTreeIcon key="sub" className="size-3.5" />, detail.subIssues ?? []],
    [
      "Blocked by",
      <OctagonAlertIcon key="by" className="size-3.5" />,
      sortBlockers(detail.blockedBy ?? []),
    ],
    ["Blocking", <BanIcon key="blocking" className="size-3.5" />, detail.blocks ?? []],
  ];
  for (const [label, icon, issues] of groups) {
    if (issues.length === 0) continue;
    rows.push({
      key: label,
      icon,
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

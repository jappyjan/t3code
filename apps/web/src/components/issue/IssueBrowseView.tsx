import type { EnvironmentIssueEntry } from "@t3tools/client-runtime/issue-list";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  IssueBrowseEntry,
  IssueBrowseInput,
  IssueBrowseResult,
  IssueContainer,
  IssueListState,
} from "@t3tools/contracts";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  MilestoneIcon,
  UsersIcon,
} from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
  WorkspaceBreadcrumbText,
} from "~/components/WorkspaceBreadcrumb";
import { PullRequestListGhost } from "~/components/pullRequest/PullRequestGhosts";
import { PullRequestsUnavailableState } from "~/components/pullRequest/PullRequestsUnavailableState";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { useProjects } from "~/state/entities";
import { issueEnvironment } from "~/state/issues";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";

import { IssueRow, type IssueRowTarget } from "./IssueRow";
import {
  appendIssueBrowseEntries,
  issueBrowseTeamKey,
  issueContainerProgressLabel,
  nestIssueBrowseEntries,
  splitIssueContainers,
  type IssueBrowseTeam,
} from "@t3tools/client-runtime/issue-browse";
import { issueBrowseTeamOf, type IssueBrowsePosition } from "./issueBrowse.logic";

const TARGET_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  // Target dates are calendar days; read in the viewer's zone they would slip a day west of UTC.
  timeZone: "UTC",
});

function formatTargetDate(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : TARGET_DATE_FORMAT.format(date);
}

function teamPosition(team: IssueBrowseTeam): IssueBrowsePosition {
  return {
    environmentId: team.environmentId,
    projectId: team.projectId,
    tracker: team.tracker,
    ...(team.host ? { host: team.host } : {}),
    scope: team.scope,
  };
}

/** Teams › ENG › Project › Milestone, over one level of a tracker's container tree. */
export function IssueBrowseView({
  teams,
  teamsPending,
  teamsError,
  onRetryTeams,
  position,
  state,
  environmentLabels,
  isSelected,
  onSelect,
  onNavigate,
}: {
  teams: ReadonlyArray<IssueBrowseTeam>;
  teamsPending: boolean;
  teamsError: string | null;
  onRetryTeams: () => void;
  position: IssueBrowsePosition;
  state: IssueListState;
  /** Only when more than one environment can be read, where a team key alone is ambiguous. */
  environmentLabels: ReadonlyMap<EnvironmentId, string> | null;
  isSelected: (row: EnvironmentIssueEntry) => boolean;
  onSelect: (entry: IssueRowTarget) => void;
  onNavigate: (position: IssueBrowsePosition) => void;
}) {
  const projects = useProjects();
  // A single team needs no picking; its level stands in for the teams list.
  const explicitTeam = issueBrowseTeamOf(position);
  const team = explicitTeam ?? (teams.length === 1 ? teams[0]! : null);
  const teamLevel = explicitTeam === null && team !== null ? teamPosition(team) : position;

  const crumbs: Array<{ level: string; label: string; target: IssueBrowsePosition | null }> = [];
  if (teams.length !== 1)
    crumbs.push({ level: "teams", label: "Teams", target: team === null ? null : {} });
  if (team !== null) {
    const base = teamPosition(team);
    const { project, milestone } = teamLevel;
    const name =
      team.name ??
      teams.find((candidate) => issueBrowseTeamKey(candidate) === issueBrowseTeamKey(team))?.name;
    crumbs.push({ level: "team", label: name ?? team.scope, target: project ? base : null });
    if (project) {
      crumbs.push({
        level: "project",
        label: project.name,
        target: milestone ? { ...base, project } : null,
      });
      if (milestone) crumbs.push({ level: "milestone", label: milestone.name, target: null });
    }
  }

  const breadcrumb = (
    <WorkspaceBreadcrumb ariaLabel="Browse breadcrumb">
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb.level}>
          {index > 0 ? (
            <WorkspaceBreadcrumbSeparator>
              <ChevronRightIcon className="size-3.5" />
            </WorkspaceBreadcrumbSeparator>
          ) : null}
          <WorkspaceBreadcrumbItem current={crumb.target === null}>
            {crumb.target === null ? (
              <WorkspaceBreadcrumbText>{crumb.label}</WorkspaceBreadcrumbText>
            ) : (
              <Button
                size="xs"
                variant="ghost-muted"
                onClick={() => onNavigate(crumb.target ?? {})}
              >
                {crumb.label}
              </Button>
            )}
          </WorkspaceBreadcrumbItem>
        </Fragment>
      ))}
    </WorkspaceBreadcrumb>
  );

  if (team !== null) {
    const input = browseInput(team, teamLevel, state);
    return (
      <BrowseLevel
        key={JSON.stringify([team.environmentId, input])}
        breadcrumb={breadcrumb}
        environmentId={team.environmentId}
        input={input}
        position={teamLevel}
        isSelected={isSelected}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BrowseToolbar breadcrumb={breadcrumb} refresh={onRetryTeams} refreshing={teamsPending} />
      {teams.length === 0 && teamsPending ? (
        <PullRequestListGhost />
      ) : teams.length === 0 && teamsError ? (
        <PullRequestsUnavailableState
          error={teamsError}
          onRetry={onRetryTeams}
          refreshing={teamsPending}
        />
      ) : teams.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No teams to browse</EmptyTitle>
            <EmptyDescription>
              Connect Linear under Settings → Source control & issues.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-0.5">
          {teams.map((candidate) => {
            const project = projects.find(
              (p) => p.environmentId === candidate.environmentId && p.id === candidate.projectId,
            );
            const environment = environmentLabels?.get(candidate.environmentId);
            return (
              <BrowseRow
                key={issueBrowseTeamKey(candidate)}
                icon={<UsersIcon aria-hidden className="size-4 text-muted-foreground" />}
                title={candidate.name ?? candidate.scope}
                meta={[
                  candidate.name ? candidate.scope : null,
                  candidate.bound ? project?.title : null,
                  environment,
                ]}
                onClick={() => onNavigate(teamPosition(candidate))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function BrowseToolbar({
  breadcrumb,
  refresh,
  refreshing,
}: {
  breadcrumb: ReactNode;
  refresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">{breadcrumb}</div>
      <Button
        size="icon-xs"
        variant="ghost-muted"
        aria-label="Refresh"
        onClick={refresh}
        disabled={refreshing}
      >
        <RefreshIcon refreshing={refreshing} />
      </Button>
    </div>
  );
}

function browseInput(
  team: IssueBrowseTeam,
  position: IssueBrowsePosition,
  state: IssueListState,
): IssueBrowseInput {
  const container = position.milestone
    ? { kind: "milestone" as const, id: position.milestone.id }
    : position.project
      ? { kind: "project" as const, id: position.project.id }
      : undefined;
  return {
    projectId: team.projectId,
    tracker: team.tracker,
    ...(team.host ? { host: team.host } : {}),
    scope: team.scope,
    state,
    ...(container ? { container } : {}),
  };
}

interface HeldBrowsePage {
  readonly base: IssueBrowseResult;
  readonly entries: ReadonlyArray<IssueBrowseEntry>;
  readonly nextCursor: string | null;
  readonly failure: string | null;
}

function BrowseLevel({
  breadcrumb,
  environmentId,
  input,
  position,
  isSelected,
  onSelect,
  onNavigate,
}: {
  breadcrumb: ReactNode;
  environmentId: EnvironmentId;
  input: IssueBrowseInput;
  position: IssueBrowsePosition;
  isSelected: (row: EnvironmentIssueEntry) => boolean;
  onSelect: (entry: IssueRowTarget) => void;
  onNavigate: (position: IssueBrowsePosition) => void;
}) {
  const query = useEnvironmentQuery(issueEnvironment.browse({ environmentId, input }));
  const loadPage = useAtomCommand(issueEnvironment.browsePage, { reportFailure: false });
  const [more, setMore] = useState<HeldBrowsePage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const toolbar = (
    <BrowseToolbar breadcrumb={breadcrumb} refresh={query.refresh} refreshing={query.isPending} />
  );
  const result = query.data;
  if (result === null) {
    return (
      <div className="flex flex-col gap-3">
        {toolbar}
        {query.error !== null && !query.isPending ? (
          <PullRequestsUnavailableState
            error={query.error}
            onRetry={query.refresh}
            refreshing={query.isPending}
          />
        ) : (
          <PullRequestListGhost />
        )}
      </div>
    );
  }

  // Continuations belong to the first page they continued; a refreshed first page starts over.
  const held: HeldBrowsePage =
    more?.base === result
      ? more
      : { base: result, entries: result.entries, nextCursor: result.nextCursor, failure: null };

  const loadMore = async () => {
    if (held.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const next = await loadPage({ environmentId, input: { ...input, cursor: held.nextCursor } });
    setLoadingMore(false);
    if (next._tag === "Failure") {
      const failure = squashAtomCommandFailure(next);
      setMore({
        ...held,
        failure: failure instanceof Error ? failure.message : "The next page failed.",
      });
      return;
    }
    setMore({
      base: result,
      entries: appendIssueBrowseEntries(held.entries, next.value.entries),
      nextCursor: next.value.nextCursor,
      failure: null,
    });
  };

  const atTeam = input.container === undefined;
  const { active, completed } = splitIssueContainers(result.containers);
  const rows = nestIssueBrowseEntries(held.entries);
  const openContainer = (container: IssueContainer) =>
    onNavigate(
      container.kind === "project"
        ? { ...position, project: { id: container.id, name: container.name } }
        : { ...position, milestone: { id: container.id, name: container.name } },
    );

  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      {query.error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-surface px-3 py-2 text-xs">
          <span>{query.error} Showing what loaded before.</span>
          <Button size="xs" variant="outline" onClick={query.refresh}>
            Retry
          </Button>
        </div>
      ) : null}
      {result.containers.length > 0 ? (
        <ContainerSection
          heading={atTeam ? "Projects" : "Milestones"}
          active={active}
          completed={completed}
          onOpen={openContainer}
        />
      ) : null}
      {atTeam && result.containers.length === 0 ? (
        <p className="px-3 text-sm text-muted-foreground">This team has no projects.</p>
      ) : null}
      {!atTeam ? (
        <section className="flex flex-col gap-1">
          {input.container?.kind === "project" ? (
            <h2 className="px-3 text-xs font-medium text-muted-foreground">No milestone</h2>
          ) : null}
          {rows.length === 0 ? (
            <p className="px-3 text-sm text-muted-foreground">No issues under this filter.</p>
          ) : null}
          {rows.map(({ entry, depth }) => {
            const row: EnvironmentIssueEntry = { ...entry, environmentId };
            return (
              <IssueRow
                key={entry.key}
                entry={row}
                selected={isSelected(row)}
                showScope={false}
                showTracker={false}
                depth={depth}
                subIssueCount={entry.subIssueCount}
                blocked={entry.blocked}
                onSelect={onSelect}
              />
            );
          })}
          {held.failure === null ? null : (
            <p className="px-3 text-xs text-destructive">{held.failure}</p>
          )}
          {held.nextCursor !== null ? (
            <Button
              size="sm"
              variant="ghost-muted"
              className="self-start"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : held.failure === null ? "Load more" : "Retry"}
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ContainerSection({
  heading,
  active,
  completed,
  onOpen,
}: {
  heading: string;
  active: ReadonlyArray<IssueContainer>;
  completed: ReadonlyArray<IssueContainer>;
  onOpen: (container: IssueContainer) => void;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const row = (container: IssueContainer) => (
    <BrowseRow
      key={container.id}
      icon={
        container.kind === "project" ? (
          <FolderIcon aria-hidden className="size-4 text-muted-foreground" />
        ) : (
          <MilestoneIcon aria-hidden className="size-4 text-muted-foreground" />
        )
      }
      title={container.name}
      meta={[
        container.status,
        issueContainerProgressLabel(container.progress),
        formatTargetDate(container.targetDate),
      ]}
      onClick={() => onOpen(container)}
    />
  );
  return (
    <section className="flex flex-col gap-0.5">
      <h2 className="px-3 text-xs font-medium text-muted-foreground">{heading}</h2>
      {active.map(row)}
      {completed.length > 0 ? (
        <Button
          size="xs"
          variant="ghost-muted"
          className="self-start"
          aria-expanded={showCompleted}
          onClick={() => setShowCompleted((open) => !open)}
        >
          {showCompleted ? <ChevronDownIcon /> : <ChevronRightIcon />}
          Completed ({completed.length})
        </Button>
      ) : null}
      {showCompleted ? completed.map(row) : null}
    </section>
  );
}

function BrowseRow({
  icon,
  title,
  meta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  meta: ReadonlyArray<string | null | undefined>;
  onClick: () => void;
}) {
  const parts = meta.filter((part): part is string => Boolean(part));
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent/60"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
      {parts.length > 0 ? (
        <span className="shrink-0 truncate text-xs text-muted-foreground tabular-nums">
          {parts.join(" · ")}
        </span>
      ) : null}
      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

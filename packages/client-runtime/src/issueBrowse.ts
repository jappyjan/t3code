import type {
  EnvironmentId,
  IssueBrowseEntry,
  IssueContainer,
  IssueListResult,
  IssueTrackerKind,
  ProjectId,
} from "@t3tools/contracts";

/** A team a T3 project reads, which the browse view can open. */
export interface IssueBrowseTeam {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly tracker: IssueTrackerKind;
  readonly host: string | undefined;
  readonly scope: string;
}

export function issueBrowseTeamKey(
  team: Pick<IssueBrowseTeam, "environmentId" | "tracker" | "host" | "scope">,
) {
  return `${team.environmentId} ${team.tracker} ${(team.host ?? "").toLowerCase()} ${team.scope.toLowerCase()}`;
}

/** Every scope a listing covered whose tracker can be browsed, once per environment. */
export function issueBrowseTeams(
  answers: ReadonlyArray<readonly [EnvironmentId, IssueListResult]>,
): ReadonlyArray<IssueBrowseTeam> {
  const teams = new Map<string, IssueBrowseTeam>();
  for (const [environmentId, answer] of answers) {
    for (const scope of answer.scopes ?? []) {
      const browsable = answer.trackers.some(
        (tracker) =>
          tracker.tracker === scope.tracker &&
          (scope.host === undefined || tracker.host.toLowerCase() === scope.host.toLowerCase()) &&
          tracker.capabilities?.browse === true,
      );
      if (!browsable) continue;
      const team: IssueBrowseTeam = {
        environmentId,
        projectId: scope.projectId,
        tracker: scope.tracker,
        host: scope.host,
        scope: scope.scope,
      };
      const key = issueBrowseTeamKey(team);
      if (!teams.has(key)) teams.set(key, team);
    }
  }
  return [...teams.values()].sort((a, b) => a.scope.localeCompare(b.scope));
}

/** Containers still in play first; finished ones go under a collapsed toggle. */
export function splitIssueContainers(containers: ReadonlyArray<IssueContainer>): {
  readonly active: ReadonlyArray<IssueContainer>;
  readonly completed: ReadonlyArray<IssueContainer>;
} {
  const active: IssueContainer[] = [];
  const completed: IssueContainer[] = [];
  for (const container of containers) (container.completed ? completed : active).push(container);
  return { active, completed };
}

export interface NestedIssueBrowseEntry {
  readonly entry: IssueBrowseEntry;
  readonly depth: number;
}

/** Sub-issues right under their parent when the parent is in the same list, otherwise in place. */
export function nestIssueBrowseEntries(
  entries: ReadonlyArray<IssueBrowseEntry>,
): ReadonlyArray<NestedIssueBrowseEntry> {
  const byKey = new Map(entries.map((entry) => [entry.key, entry] as const));
  const children = new Map<string, IssueBrowseEntry[]>();
  const roots: IssueBrowseEntry[] = [];
  for (const entry of entries) {
    const parentKey = entry.parentKey;
    if (parentKey !== null && parentKey !== entry.key && byKey.has(parentKey)) {
      const siblings = children.get(parentKey);
      if (siblings) siblings.push(entry);
      else children.set(parentKey, [entry]);
    } else {
      roots.push(entry);
    }
  }
  const nested: NestedIssueBrowseEntry[] = [];
  const placed = new Set<string>();
  const visit = (entry: IssueBrowseEntry, depth: number) => {
    if (placed.has(entry.key)) return;
    placed.add(entry.key);
    nested.push({ entry, depth });
    for (const child of children.get(entry.key) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  // A parent cycle has no root; its members still show, flat.
  for (const entry of entries) visit(entry, 0);
  return nested;
}

/** Continuation entries after the first page's, without repeating a key a page shifted over. */
export function appendIssueBrowseEntries(
  held: ReadonlyArray<IssueBrowseEntry>,
  next: ReadonlyArray<IssueBrowseEntry>,
): ReadonlyArray<IssueBrowseEntry> {
  const seen = new Set(held.map((entry) => entry.key));
  return [...held, ...next.filter((entry) => !seen.has(entry.key))];
}

export function issueContainerProgressLabel(progress: number | null): string | null {
  if (progress === null || !Number.isFinite(progress)) return null;
  return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
}

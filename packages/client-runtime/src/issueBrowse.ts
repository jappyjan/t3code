import type {
  EnvironmentId,
  IssueBrowseEntry,
  IssueContainer,
  IssueTrackerConnectionList,
  IssueTrackerKind,
  ProjectId,
} from "@t3tools/contracts";

/**
 * A team of a connected standalone tracker. `projectId` serves the reads: the project bound to
 * the team, or any project of the environment when none is, since the credential spans them all.
 */
export interface IssueBrowseTeam {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly tracker: IssueTrackerKind;
  readonly host: string | undefined;
  readonly scope: string;
  readonly name?: string | undefined;
  /** `projectId` is bound to the team in Settings, rather than lending its credential. */
  readonly bound?: boolean;
}

export function issueBrowseTeamKey(
  team: Pick<IssueBrowseTeam, "environmentId" | "tracker" | "host" | "scope">,
) {
  return `${team.environmentId} ${team.tracker} ${(team.host ?? "").toLowerCase()} ${team.scope.toLowerCase()}`;
}

/** The projects bound to a tracker's scope, which launches from its issues start in. */
export function projectsBoundToScope(
  bindings: IssueTrackerConnectionList["bindings"],
  tracker: IssueTrackerKind,
  scope: string,
): ReadonlyArray<ProjectId> {
  const wanted = scope.toLowerCase();
  return Object.entries(bindings)
    .filter(([, binding]) => binding.tracker === tracker && binding.scope.toLowerCase() === wanted)
    .map(([projectId]) => projectId as ProjectId);
}

/** Every team each environment's connected trackers reach, bound to a project or not. */
export function issueBrowseTeams(
  answers: ReadonlyArray<readonly [EnvironmentId, IssueTrackerConnectionList]>,
  projects: ReadonlyArray<{ readonly environmentId: EnvironmentId; readonly id: ProjectId }>,
): ReadonlyArray<IssueBrowseTeam> {
  const teams: IssueBrowseTeam[] = [];
  for (const [environmentId, answer] of answers) {
    const own = new Set(
      projects.filter((project) => project.environmentId === environmentId).map((p) => p.id),
    );
    const lender = [...own][0];
    for (const tracker of answer.trackers) {
      if (!tracker.connected || tracker.account === null) continue;
      for (const scope of tracker.scopes) {
        const bound = projectsBoundToScope(answer.bindings, tracker.tracker, scope.key).find(
          (projectId) => own.has(projectId),
        );
        const projectId = bound ?? lender;
        if (projectId === undefined) continue;
        teams.push({
          environmentId,
          projectId,
          tracker: tracker.tracker,
          host: tracker.host,
          scope: scope.key,
          name: scope.name,
          bound: bound !== undefined,
        });
      }
    }
  }
  return teams.sort(
    (a, b) =>
      (a.name ?? a.scope).localeCompare(b.name ?? b.scope) ||
      a.environmentId.localeCompare(b.environmentId),
  );
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

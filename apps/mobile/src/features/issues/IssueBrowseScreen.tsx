import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  IssueBrowseEntry,
  IssueBrowseInput,
  IssueBrowseResult,
  IssueContainer,
  IssueListState,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppBar } from "../../components/ui/AppBar";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { RefreshControl } from "../../components/ui/RefreshControl";
import { NativeScrollView } from "../../native/NativeScrollViewMarker";
import { useEnvironments } from "../../state/environments";
import { issueEnvironment } from "../../state/issues";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { usePullToRefresh } from "../../state/use-pull-to-refresh";
import { PullRequestSectionHeading } from "../pull-requests/PullRequestSectionHeading";
import {
  appendIssueBrowseEntries,
  issueBrowseTeamKey,
  issueContainerProgressLabel,
  nestIssueBrowseEntries,
  splitIssueContainers,
  type IssueBrowseTeam,
} from "@t3tools/client-runtime/issue-browse";
import { IssueListRow } from "./IssueListRow";

interface IssueBrowseCrumb {
  readonly id: string;
  readonly name: string;
}

/** One level of a tracker's tree: the teams, a team's projects, a project, or a milestone. */
type IssueBrowseParams = {
  readonly teams?: ReadonlyArray<IssueBrowseTeam>;
  readonly team?: IssueBrowseTeam;
  readonly project?: IssueBrowseCrumb;
  readonly milestone?: IssueBrowseCrumb;
};

const STATES = {
  open: "Open",
  closed: "Closed",
  all: "All states",
} as const satisfies Record<IssueListState, string>;

export function IssueBrowseScreen({ route }: StaticScreenProps<IssueBrowseParams>) {
  const { team, project, milestone } = route.params;
  if (!team) return <IssueBrowseTeams teams={route.params.teams ?? []} />;
  return (
    <IssueBrowseLevel
      key={`${issueBrowseTeamKey(team)} ${project?.id ?? ""} ${milestone?.id ?? ""}`}
      team={team}
      project={project}
      milestone={milestone}
    />
  );
}

function ChevronRow(props: {
  readonly icon: Parameters<typeof SymbolView>[0]["name"];
  readonly title: string;
  readonly detail?: string | null;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-grouped-card p-3 active:opacity-70"
    >
      <SymbolView name={props.icon} size={16} tintColorClassName="accent-icon-muted" />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-t3-medium" numberOfLines={2}>
          {props.title}
        </Text>
        {props.detail ? (
          <Text className="text-2xs text-foreground-muted" numberOfLines={1}>
            {props.detail}
          </Text>
        ) : null}
      </View>
      <SymbolView name="chevron.right" size={12} tintColorClassName="accent-icon-muted" />
    </Pressable>
  );
}

function IssueBrowseTeams(props: { readonly teams: ReadonlyArray<IssueBrowseTeam> }) {
  const navigation = useNavigation();
  const { environments } = useEnvironments();
  const several = new Set(props.teams.map((team) => team.environmentId)).size > 1;
  return (
    <View className="flex-1 bg-screen">
      <AppBar title="Projects" subtitle="Choose a team" onBack={() => navigation.goBack()} />
      <NativeScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 8 }}
      >
        {props.teams.length === 0 ? (
          <EmptyState
            title="Nothing to browse"
            detail="Bind a Linear team to a project in Settings to browse its projects."
            variant="plain"
          />
        ) : null}
        {props.teams.map((team) => (
          <ChevronRow
            key={issueBrowseTeamKey(team)}
            icon="person.2"
            title={team.scope}
            detail={
              several
                ? environments.find(
                    (environment) => environment.environmentId === team.environmentId,
                  )?.label
                : null
            }
            accessibilityLabel={`Team ${team.scope}`}
            onPress={() => navigation.dispatch(StackActions.push("IssueBrowse", { team }))}
          />
        ))}
      </NativeScrollView>
    </View>
  );
}

/** "2026-12-01" as a local day; `Date.parse` would read it as UTC midnight. */
function formatTargetDate(targetDate: string | null) {
  if (!targetDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(targetDate);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(targetDate);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function containerDetail(container: IssueContainer) {
  const target = formatTargetDate(container.targetDate);
  return [
    container.status,
    issueContainerProgressLabel(container.progress),
    target ? `Target ${target}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function IssueBrowseLevel(props: {
  readonly team: IssueBrowseTeam;
  readonly project: IssueBrowseCrumb | undefined;
  readonly milestone: IssueBrowseCrumb | undefined;
}) {
  const { team, project, milestone } = props;
  const navigation = useNavigation();
  const [state, setState] = useState<IssueListState>("open");
  const [showCompleted, setShowCompleted] = useState(false);
  const container = milestone
    ? ({ kind: "milestone", id: milestone.id } as const)
    : project
      ? ({ kind: "project", id: project.id } as const)
      : undefined;
  const input: IssueBrowseInput = {
    projectId: team.projectId,
    tracker: team.tracker,
    ...(team.host ? { host: team.host } : {}),
    scope: team.scope,
    ...(container ? { container } : {}),
    state,
  };
  const browseAtom = issueEnvironment.browse({ environmentId: team.environmentId, input });
  const query = useEnvironmentQuery(browseAtom);
  const pullRefresh = usePullToRefresh(browseAtom);
  const loadPage = useAtomCommand(issueEnvironment.browsePage, { reportFailure: false });
  // Later pages hang off the first page they continued; a fresh first page starts over.
  const [more, setMore] = useState<{
    readonly seed: IssueBrowseResult;
    readonly entries: ReadonlyArray<IssueBrowseEntry>;
    readonly cursor: string | null;
    readonly error: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = query.data;
  const held = first && more?.seed === first ? more : null;
  const entries = first ? appendIssueBrowseEntries(first.entries, held?.entries ?? []) : [];
  const nextCursor = first ? (held ? held.cursor : first.nextCursor) : null;
  const { active, completed } = splitIssueContainers(first?.containers ?? []);
  const nested = nestIssueBrowseEntries(entries);

  const loadMore = async () => {
    if (!first || nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const result = await loadPage({
      environmentId: team.environmentId,
      input: { ...input, cursor: nextCursor },
    });
    setLoadingMore(false);
    if (AsyncResult.isFailure(result)) {
      const failure = squashAtomCommandFailure(result);
      setMore({
        seed: first,
        entries: held?.entries ?? [],
        cursor: nextCursor,
        error: failure instanceof Error ? failure.message : "The next page failed.",
      });
      return;
    }
    setMore({
      seed: first,
      entries: appendIssueBrowseEntries(held?.entries ?? [], result.value.entries),
      cursor: result.value.nextCursor,
      error: null,
    });
  };

  const openContainer = (next: IssueContainer) =>
    navigation.dispatch(
      StackActions.push(
        "IssueBrowse",
        next.kind === "project"
          ? { team, project: { id: next.id, name: next.name } }
          : { team, ...(project ? { project } : {}), milestone: { id: next.id, name: next.name } },
      ),
    );
  const openIssue = (entry: IssueBrowseEntry) =>
    navigation.dispatch(
      StackActions.push("Issue", {
        environmentId: String(team.environmentId),
        projectId: String(entry.projectId),
        tracker: entry.tracker,
        host: entry.host,
        scope: entry.scope,
        issueKey: entry.key,
        initialSummary: entry,
      }),
    );

  const containerRows = (containers: ReadonlyArray<IssueContainer>) =>
    containers.map((item) => (
      <ChevronRow
        key={`${item.kind}:${item.id}`}
        icon={item.kind === "project" ? "folder.fill" : "circle.dashed.inset.filled"}
        title={item.name}
        detail={containerDetail(item)}
        accessibilityLabel={`${item.kind === "project" ? "Project" : "Milestone"} ${item.name}`}
        onPress={() => openContainer(item)}
      />
    ));
  const containerNoun = project ? "Milestones" : "Projects";
  const title = milestone?.name ?? project?.name ?? team.scope;
  const subtitle =
    milestone && project ? `${team.scope} › ${project.name}` : project ? team.scope : "Projects";
  return (
    <View className="flex-1 bg-screen">
      <AppBar
        title={title}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
        menus={
          container
            ? [
                {
                  title: "Issue state",
                  icon:
                    state === "open"
                      ? "line.3.horizontal.decrease.circle"
                      : "line.3.horizontal.decrease.circle.fill",
                  items: (Object.entries(STATES) as Array<[IssueListState, string]>).map(
                    ([id, label]) => ({
                      id,
                      title: label,
                      selected: id === state,
                      onPress: () => setState(id),
                    }),
                  ),
                },
              ]
            : []
        }
      />
      <NativeScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={pullRefresh.refreshing} onRefresh={pullRefresh.onRefresh} />
        }
        contentContainerStyle={{ paddingVertical: 16, gap: 20 }}
      >
        {!first ? (
          query.error && !query.isPending ? (
            <EmptyState
              title={`Couldn't load ${project ? "this project" : "projects"}`}
              detail={query.error}
              variant="plain"
            />
          ) : (
            <AppActivityIndicator className="my-12" colorClassName="accent-icon" />
          )
        ) : (
          <>
            {active.length > 0 || completed.length > 0 ? (
              <View className="gap-2 px-4">
                <PullRequestSectionHeading>{containerNoun}</PullRequestSectionHeading>
                {containerRows(active)}
                {completed.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showCompleted }}
                    onPress={() => setShowCompleted(!showCompleted)}
                    className="min-h-10 flex-row items-center gap-2 px-1 active:opacity-70"
                  >
                    <SymbolView
                      name={showCompleted ? "chevron.down" : "chevron.right"}
                      size={11}
                      tintColorClassName="accent-icon-muted"
                    />
                    <Text className="text-xs text-foreground-muted">
                      Completed ({completed.length})
                    </Text>
                  </Pressable>
                ) : null}
                {showCompleted ? containerRows(completed) : null}
              </View>
            ) : null}
            {container ? (
              <View>
                <View className="px-4 pb-1">
                  <PullRequestSectionHeading>
                    {milestone ? "Issues" : "No milestone"}
                  </PullRequestSectionHeading>
                </View>
                {nested.length === 0 ? (
                  <Text className="px-4 py-2 text-sm text-foreground-muted">
                    No {state === "all" ? "" : `${STATES[state].toLowerCase()} `}issues here.
                  </Text>
                ) : null}
                {nested.map(({ entry, depth }) => (
                  <IssueListRow
                    key={entry.key}
                    item={{ ...entry, environmentId: team.environmentId }}
                    onSelect={() => openIssue(entry)}
                    selected={false}
                    sidebar={false}
                    depth={depth}
                    subIssueCount={entry.subIssueCount}
                    blocked={entry.blocked}
                  />
                ))}
                {held?.error ? (
                  <Text className="px-4 pt-3 text-xs text-foreground-muted">{held.error}</Text>
                ) : null}
                {nextCursor !== null ? (
                  <View className="items-center pt-3">
                    {loadingMore ? (
                      <AppActivityIndicator
                        colorClassName="accent-icon"
                        accessibilityLabel="Loading more issues"
                      />
                    ) : (
                      <Button
                        label={held?.error ? "Try again" : "Load more"}
                        accessibilityLabel="Load more issues"
                        onPress={() => void loadMore()}
                      />
                    )}
                  </View>
                ) : null}
              </View>
            ) : active.length === 0 && completed.length === 0 ? (
              <EmptyState
                title="No projects"
                detail={`${team.scope} has no projects yet.`}
                variant="plain"
              />
            ) : null}
          </>
        )}
      </NativeScrollView>
    </View>
  );
}

import { StackActions, useNavigation } from "@react-navigation/native";
import {
  EnvironmentId,
  IssueTrackerKind,
  type IssueDetail,
  type IssueRelatedRef,
} from "@t3tools/contracts";
import { sortBlockers } from "@t3tools/shared/linearLaunch";
import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { PullRequestSectionHeading } from "../pull-requests/PullRequestSectionHeading";
import type { IssueParams } from "./issueParams";
import { IssueStatusIcon, issueStatus } from "./issuePresentation";

function RelatedIssueRow(props: {
  readonly issue: IssueRelatedRef;
  readonly onOpen: (issue: IssueRelatedRef) => void;
}) {
  const { issue } = props;
  const status = issueStatus(issue.state);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${issue.displayKey}, ${issue.title}, ${status.label}`}
      onPress={() => props.onOpen(issue)}
      className="min-h-10 flex-row items-center gap-2 active:opacity-70"
    >
      <IssueStatusIcon state={issue.state} size={14} />
      <Text className="shrink-0 font-mono text-2xs text-foreground-muted">{issue.displayKey}</Text>
      <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
        {issue.title}
      </Text>
      <SymbolView name="chevron.right" size={11} tintColorClassName="accent-icon-muted" />
    </Pressable>
  );
}

/** Project, milestone, branch, parent and relations, for trackers that report them. */
export function IssueRelations(props: {
  readonly params: Omit<IssueParams, "initialSummary">;
  readonly detail: IssueDetail;
}) {
  const { params, detail } = props;
  const navigation = useNavigation();
  const containers = detail.containers ?? [];
  const project = containers.find((container) => container.kind === "project");
  const milestone = containers.find((container) => container.kind === "milestone");
  const groups: Array<readonly [string, ReadonlyArray<IssueRelatedRef>]> = [
    ["Parent", detail.parent ? [detail.parent] : []],
    ["Sub-issues", detail.subIssues ?? []],
    ["Blocked by", sortBlockers(detail.blockedBy ?? [])],
    ["Blocking", detail.blocks ?? []],
  ];
  const related = groups.filter(([, issues]) => issues.length > 0);
  if (!project && !detail.branchName && !detail.priorityLabel && related.length === 0) return null;

  const openRelated = (issue: IssueRelatedRef) =>
    navigation.dispatch(
      StackActions.push("Issue", {
        environmentId: params.environmentId,
        projectId: params.projectId,
        tracker: params.tracker,
        ...(params.host ? { host: params.host } : {}),
        // A sub-issue or blocker can sit in another team.
        scope: issue.key.replace(/-\d+$/u, ""),
        issueKey: issue.key,
      }),
    );
  const openContainer = () => {
    if (!project) return;
    navigation.dispatch(
      StackActions.push("IssueBrowse", {
        team: {
          environmentId: EnvironmentId.make(params.environmentId),
          projectId: detail.projectId,
          tracker: IssueTrackerKind.make(params.tracker),
          host: params.host,
          scope: params.scope,
        },
        project: { id: project.id, name: project.name },
        ...(milestone ? { milestone: { id: milestone.id, name: milestone.name } } : {}),
      }),
    );
  };

  return (
    <View className="gap-3 rounded-2xl bg-grouped-card p-3">
      {project ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Browse ${containers.map((container) => container.name).join(", ")}`}
          onPress={openContainer}
          className="flex-row items-center gap-2 active:opacity-70"
        >
          <SymbolView name="folder.fill" size={14} tintColorClassName="accent-icon-muted" />
          <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
            {containers.map((container) => container.name).join(" › ")}
          </Text>
          <SymbolView name="chevron.right" size={11} tintColorClassName="accent-icon-muted" />
        </Pressable>
      ) : null}
      {detail.branchName ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Branch ${detail.branchName}. Copy`}
          onPress={() => copyTextWithHaptic(detail.branchName!, { target: "branch name" })}
          className="flex-row items-center gap-2 active:opacity-70"
        >
          <SymbolView
            name="arrow.triangle.branch"
            size={14}
            tintColorClassName="accent-icon-muted"
          />
          <Text className="min-w-0 flex-1 font-mono text-xs" numberOfLines={1}>
            {detail.branchName}
          </Text>
          <SymbolView name="doc.on.doc" size={12} tintColorClassName="accent-icon-muted" />
        </Pressable>
      ) : null}
      {detail.priorityLabel ? (
        <View
          accessible
          accessibilityLabel={`Priority ${detail.priorityLabel}`}
          className="flex-row items-center gap-2"
        >
          <SymbolView name="flag.fill" size={14} tintColorClassName="accent-icon-muted" />
          <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
            {detail.priorityLabel}
          </Text>
        </View>
      ) : null}
      {related.map(([label, issues]) => (
        <View key={label} className="gap-0.5">
          <PullRequestSectionHeading>{label}</PullRequestSectionHeading>
          {issues.map((issue) => (
            <RelatedIssueRow key={issue.key} issue={issue} onOpen={openRelated} />
          ))}
        </View>
      ))}
    </View>
  );
}

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { StackActions, useNavigation } from "@react-navigation/native";
import { projectsBoundToScope } from "@t3tools/client-runtime/issue-browse";
import {
  canLaunchFromIssue,
  launchProjectChoiceKey,
  resolveLaunchProject,
  type LinearLaunchWorkspace,
} from "@t3tools/client-runtime/linear/launch";
import { ProjectId, type EnvironmentId, type IssueDetail } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useGT } from "gt-react-native";
import { useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { Menu } from "../../components/ui/Menu";
import { SplitButton } from "../../components/ui/SplitButton";
import { useProjects, useServerConfigs } from "../../state/entities";
import { issueTrackerEnvironment } from "../../state/issueTrackers";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";
import { createLinearChatDraft } from "./linearChatDraft";
import type { IssueParams } from "./issueParams";

/**
 * Start chat and Run pipeline for an issue whose tracker names a branch. Both start in the
 * project bound to its Linear team in Settings; for an unbound team a Project row asks, and the
 * pick is remembered for the team on this device.
 */
export function LinearIssueLaunchBar(props: {
  readonly environmentId: EnvironmentId;
  readonly identity: Omit<IssueParams, "initialSummary">;
  readonly detail: IssueDetail;
}) {
  const { environmentId, detail } = props;
  const gt = useGT();
  const navigation = useNavigation();
  const selectDetail = useSelectWorkspaceDetail();
  const canStartPipelines = useAtomValue(
    serverEnvironment.startPipelineRun.permissionAtom(environmentId),
  );
  const serverConfig = useServerConfigs().get(environmentId);
  const canRunPipeline =
    canStartPipelines && serverConfig?.environment.capabilities.pipelines === true;
  // A second tap while the draft is created would create a second draft.
  const starting = useRef(false);
  const [startingChat, setStartingChat] = useState(false);
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const bindings =
    useEnvironmentQuery(issueTrackerEnvironment.connections({ environmentId, input: {} })).data
      ?.bindings ?? {};
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const choices = AsyncResult.isSuccess(preferences)
    ? (preferences.value.linearLaunchProjects ?? {})
    : {};
  const choiceKey = launchProjectChoiceKey(environmentId, detail.tracker, detail.scope);
  if (!canLaunchFromIssue(detail)) return null;

  const target = resolveLaunchProject({
    bound: projectsBoundToScope(bindings, detail.tracker, detail.scope),
    remembered: choices[choiceKey],
    available: projects.map((project) => project.id),
  });
  const launchProjectId = target.projectId;
  const pick = (projectId: string) =>
    savePreferences({ linearLaunchProjects: { ...choices, [choiceKey]: projectId } });

  const startChat = (workspace: LinearLaunchWorkspace) => {
    if (starting.current || launchProjectId === null) return;
    starting.current = true;
    setStartingChat(true);
    void createLinearChatDraft({
      environmentId,
      detail: { ...detail, projectId: launchProjectId },
      workspace,
    })
      .then((draftKey) => {
        const destination = {
          draft: {
            environmentId: String(environmentId),
            projectId: String(launchProjectId),
            draftId: draftKey,
            title: detail.displayKey,
          },
        };
        // Android shows one page at a time; iOS pushes the draft over the issue, so Back returns.
        if (Platform.OS === "android") selectDetail({ name: "Thread", params: destination });
        else navigation.dispatch(StackActions.push("Thread", destination));
      })
      .catch((error: unknown) =>
        Dialog.alert(
          gt("Could not start a chat"),
          error instanceof Error ? error.message : gt("The draft could not be created."),
        ),
      )
      .finally(() => {
        starting.current = false;
        setStartingChat(false);
      });
  };

  return (
    <View className="gap-2">
      {target.bound ? null : (
        <Menu
          title={gt("Start in project")}
          actions={projects.map((project) => ({
            id: project.id,
            title: project.title,
            state: project.id === launchProjectId ? ("on" as const) : ("off" as const),
          }))}
          onPressAction={({ nativeEvent }) => pick(ProjectId.make(nativeEvent.event))}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={gt("Project to start in")}
            className="min-h-11 flex-row items-center gap-2 rounded-xl bg-grouped-card px-3 active:opacity-70"
          >
            <SymbolView name="folder.fill" size={14} tintColorClassName="accent-icon-muted" />
            <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
              {projects.find((project) => project.id === launchProjectId)?.title ??
                gt("Choose a project to start in")}
            </Text>
            <SymbolView name="chevron.down" size={12} tintColorClassName="accent-icon-muted" />
          </Pressable>
        </Menu>
      )}
      <SplitButton
        label={gt("Start chat")}
        icon="plus.bubble"
        loading={startingChat}
        disabled={startingChat || launchProjectId === null}
        onPress={() => startChat("worktree")}
        menuTitle={gt("Start chat in")}
        actions={[
          {
            id: "worktree",
            title: detail.branchName
              ? gt("New worktree · {branch}", { branch: detail.branchName })
              : gt("New worktree"),
          },
          { id: "local", title: gt("Local checkout") },
        ]}
        onPressAction={(id) => {
          if (id === "worktree" || id === "local") startChat(id);
        }}
      />
      {canRunPipeline ? (
        <Button
          label={gt("Run pipeline")}
          icon="point.3.connected.trianglepath.dotted"
          tone="secondary"
          fullWidth
          disabled={launchProjectId === null}
          onPress={() =>
            launchProjectId === null
              ? undefined
              : navigation.dispatch(
                  StackActions.push("IssuePipeline", { ...props.identity, launchProjectId }),
                )
          }
        />
      ) : null}
    </View>
  );
}

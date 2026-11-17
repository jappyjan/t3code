import { useAtomValue } from "@effect/atom-react";
import { StackActions, useNavigation } from "@react-navigation/native";
import {
  canLaunchFromIssue,
  type LinearLaunchWorkspace,
} from "@t3tools/client-runtime/linear/launch";
import type { EnvironmentId, IssueDetail } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { Platform, View } from "react-native";

import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { SplitButton } from "../../components/ui/SplitButton";
import { useServerConfigs } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";
import { createLinearChatDraft } from "./linearChatDraft";
import type { IssueParams } from "./issueParams";

/**
 * Start chat and Run pipeline for an issue whose tracker names a branch. Both start in the
 * project the issue is read through: the one bound to its Linear team in Settings.
 */
export function LinearIssueLaunchBar(props: {
  readonly environmentId: EnvironmentId;
  readonly identity: Omit<IssueParams, "initialSummary">;
  readonly detail: IssueDetail;
}) {
  const { environmentId, detail } = props;
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
  if (!canLaunchFromIssue(detail)) return null;

  const startChat = (workspace: LinearLaunchWorkspace) => {
    if (starting.current) return;
    starting.current = true;
    setStartingChat(true);
    void createLinearChatDraft({ environmentId, detail, workspace })
      .then((draftKey) => {
        const destination = {
          draft: {
            environmentId: String(environmentId),
            projectId: String(detail.projectId),
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
          "Could not start a chat",
          error instanceof Error ? error.message : "The draft could not be created.",
        ),
      )
      .finally(() => {
        starting.current = false;
        setStartingChat(false);
      });
  };

  return (
    <View className="gap-2">
      <SplitButton
        label="Start chat"
        icon="plus.bubble"
        loading={startingChat}
        disabled={startingChat}
        onPress={() => startChat("worktree")}
        menuTitle="Start chat in"
        actions={[
          {
            id: "worktree",
            title: detail.branchName ? `New worktree · ${detail.branchName}` : "New worktree",
          },
          { id: "local", title: "Local checkout" },
        ]}
        onPressAction={(id) => {
          if (id === "worktree" || id === "local") startChat(id);
        }}
      />
      {canRunPipeline ? (
        <Button
          label="Run pipeline"
          icon="point.3.connected.trianglepath.dotted"
          tone="secondary"
          fullWidth
          onPress={() => navigation.dispatch(StackActions.push("IssuePipeline", props.identity))}
        />
      ) : null}
    </View>
  );
}

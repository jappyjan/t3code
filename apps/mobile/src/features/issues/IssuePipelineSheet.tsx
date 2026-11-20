import { useAtomValue } from "@effect/atom-react";
import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  draftIssueOf,
  issueLinkInput,
  pipelineInputSummary,
  pipelineInputText,
  pipelineWorkspaceStrategy,
  type LinearLaunchWorkspace,
} from "@t3tools/client-runtime/linear/launch";
import {
  resolvePipelineSelection,
  type PipelineRef,
} from "@t3tools/client-runtime/linear/pipeline-machines";
import { nextPipelineStartAttempt } from "@t3tools/client-runtime/pipeline-start";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import { T, useGT, useMessages, Var } from "gt-react-native";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { Menu } from "../../components/ui/Menu";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SheetHeader } from "../../components/ui/SheetHeader";
import { cn } from "../../lib/cn";
import { uuidv4 } from "../../lib/uuid";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { appAtomRegistry } from "../../state/atom-registry";
import { useProjects } from "../../state/entities";
import { issueEnvironment } from "../../state/issues";
import { mobilePreferencesAtom, saveMobilePreferences } from "../../state/preferences";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { vcsEnvironment } from "../../state/vcs";
import { PullRequestMarkdown } from "../pull-requests/PullRequestMarkdown";
import { waitForThreadShell } from "../threads/wait-for-thread-shell";
import { issueTarget, type IssueParams } from "./issueParams";
import { useLinearAutoMachine, useLinearPipelineMachines } from "./useLinearPipelineMachines";

function PickerRow(props: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <View className="min-h-12 flex-row items-center gap-3 border-t border-border-subtle py-2">
      <Text className="text-sm text-foreground-muted">{props.label}</Text>
      <View className="min-w-0 flex-1 items-end">
        <Text numberOfLines={1} className="text-sm font-t3-medium text-foreground">
          {props.value}
        </Text>
        {props.hint ? (
          <Text numberOfLines={1} className="text-xs text-foreground-muted">
            {props.hint}
          </Text>
        ) : null}
      </View>
      <SymbolView name="chevron.down" size={12} tintColorClassName="accent-icon-muted" />
    </View>
  );
}

/**
 * "Run pipeline from issue": the issue as text input for a pipeline's first step. The run starts
 * in the issue's project, or its counterpart on the machine picked, and its parent thread is
 * linked to the issue there.
 */
export function IssuePipelineSheet({
  route,
}: StaticScreenProps<Omit<IssueParams, "initialSummary"> & { readonly launchProjectId?: string }>) {
  const params = route.params;
  const target = issueTarget(params);
  const { environmentId } = target;
  const gt = useGT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const detail = useEnvironmentQuery(issueEnvironment.detail(target)).data;
  const allProjects = useProjects();
  const issueProject =
    allProjects.find(
      (candidate) =>
        candidate.environmentId === environmentId &&
        candidate.id === (params.launchProjectId ?? target.input.projectId),
    ) ?? null;
  const startPipelineRun = useAtomCommand(serverEnvironment.startPipelineRun, {
    label: "pipeline start",
    reportFailure: false,
  });
  const attemptRef = useRef<ReturnType<typeof nextPipelineStartAttempt> | null>(null);

  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const lastUsed = AsyncResult.isSuccess(preferences)
    ? (preferences.value.linearLastPipelineName ?? null)
    : null;
  const [pipelineChoice, setPipelineChoice] = useState<PipelineRef | null>(null);
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [edited, setEdited] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<LinearLaunchWorkspace>("worktree");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchName = detail?.branchName ?? "";

  const machineState = useLinearPipelineMachines(environmentId, issueProject);
  const { machines } = machineState;
  const primaryPipelinesQuery = useEnvironmentQuery(
    serverEnvironment.pipelinesLive({ environmentId, input: {} }),
  );
  const pipelinesQuery = useEnvironmentQuery(
    serverEnvironment.pipelinesLive({ environmentId: machineState.listEnvironmentId, input: {} }),
  );
  const pipelines = pipelinesQuery.data?.pipelines ?? [];
  const pipelinesKnown = pipelinesQuery.data !== null || pipelinesQuery.error !== null;
  const listMachineLabel =
    machines.find((candidate) => candidate.environmentId === machineState.listEnvironmentId)
      ?.label ?? null;
  const { pipeline, unmatchedName, lastUsedId } = resolvePipelineSelection({
    pipelines,
    primaryPipelines: primaryPipelinesQuery.data?.pipelines ?? [],
    chosen: pipelineChoice,
    requestedId: null,
    lastUsedName: lastUsed,
  });

  const auto = useLinearAutoMachine({
    machines,
    active: machineState.effective === "auto",
    live: machineState.live,
    pipelineKnown: pipelinesKnown,
    pipeline,
    latch: machineState.latch,
  });
  const targetEnvironmentId =
    machineState.effective === "auto"
      ? auto.state.kind === "picked"
        ? auto.state.environmentId
        : null
      : machineState.effective;
  const machine =
    machines.find((candidate) => candidate.environmentId === targetEnvironmentId) ?? null;
  const project =
    machine === null
      ? null
      : (allProjects.find(
          (candidate) =>
            candidate.environmentId === machine.environmentId && candidate.id === machine.projectId,
        ) ?? null);

  const projectStatus = useEnvironmentQuery(
    machine !== null && project !== null && workspace === "worktree"
      ? vcsEnvironment.status({
          environmentId: machine.environmentId,
          input: { cwd: project.workspaceRoot },
        })
      : null,
  );
  const baseRef = projectStatus.data?.refName ?? null;

  const text = detail ? pipelineInputText({ detail, edited }) : "";
  const messages = useMessages();
  const summary = pipelineInputSummary(text, messages);
  const canStart =
    !pending && pipeline !== null && machine !== null && project !== null && summary.startable;

  const start = async () => {
    if (!canStart || !detail || pipeline === null || project === null || machine === null) return;
    setPending(true);
    setError(null);
    const workspaceStrategy = pipelineWorkspaceStrategy({ workspace, baseRef, branchName });
    const attempt = (attemptRef.current = nextPipelineStartAttempt(
      attemptRef.current,
      { pipelineId: pipeline.id, projectId: project.id, input: text, workspace: workspaceStrategy },
      uuidv4,
    ));
    const result = await startPipelineRun({
      environmentId: machine.environmentId,
      input: {
        commandId: attempt.commandId,
        pipelineId: pipeline.id,
        projectId: project.id,
        input: text,
        workspaceStrategy,
        creationSource: "mobile",
      },
    });
    if (result._tag === "Failure") {
      setPending(false);
      if (!isAtomCommandInterrupted(result)) {
        const failure = squashAtomCommandFailure(result);
        setError(failure instanceof Error ? failure.message : gt("Failed to start the pipeline."));
      }
      return;
    }
    const run = result.value.run;
    attemptRef.current = null;
    void savePreferences({ linearLastPipelineName: pipeline.name });
    // The run exists; linking it is best effort and never delays or blocks the launch.
    void runAtomCommand(
      appAtomRegistry,
      threadEnvironment.linkIssue,
      {
        environmentId: machine.environmentId,
        input: issueLinkInput({
          issue: draftIssueOf(detail),
          threadId: run.parentThreadId,
          projectId: project.id,
        }),
      },
      { label: "link launched issue", reportFailure: false, reportDefect: false },
    ).then((linked) => {
      if (linked._tag === "Failure") {
        const failure = squashAtomCommandFailure(linked);
        Dialog.alert(
          gt("Could not link {issue} to the run", { issue: detail.displayKey }),
          failure instanceof Error ? failure.message : gt("The server refused it."),
        );
      }
    });
    // The thread route treats a shell that has not arrived yet as an unavailable thread.
    const shellReady = await waitForThreadShell(
      { environmentId: machine.environmentId, threadId: run.parentThreadId },
      5_000,
    );
    setPending(false);
    if (shellReady) {
      navigation.dispatch(
        StackActions.replace("Thread", {
          environmentId: machine.environmentId,
          threadId: String(run.parentThreadId),
        }),
      );
    } else {
      navigation.goBack();
      Dialog.alert(gt("Pipeline started"), gt("The run will appear in your thread list shortly."));
    }
  };

  return (
    <View
      collapsable={false}
      className="bg-sheet ios:flex-1"
      style={Platform.OS === "android" ? { maxHeight: windowHeight * 0.92 } : undefined}
    >
      {Platform.OS === "android" ? (
        <NativeStackScreenOptions
          options={{ sheetCornerRadius: 28, sheetAllowedDetents: "fitToContents" }}
        />
      ) : null}
      <SheetHeader
        presentation={Platform.OS === "android" ? "inline" : "native"}
        title={gt("Run pipeline from issue")}
        subtitle={detail ? `${detail.displayKey} ${detail.title}` : undefined}
        onCancel={() => navigation.goBack()}
        dismissDisabled={pending}
        accessibilityLabel={gt("Cancel")}
        confirm={{
          label: gt("Start pipeline"),
          onPress: () => void start(),
          disabled: !canStart,
          loading: pending,
        }}
      />
      <ScreenContent fitToContents>
        <ScrollView
          nestedScrollEnabled
          contentInsetAdjustmentBehavior="automatic"
          className="android:shrink android:grow-0 ios:flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentContainerClassName="px-5 pt-4 pb-6 gap-5"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          {!detail ? (
            <Text className="text-sm text-foreground-muted">
              <T>Loading the issue…</T>
            </Text>
          ) : (
            <>
              <View className="gap-1">
                <Text className="pb-1 text-sm font-t3-medium text-foreground">
                  <T>Pipeline</T>
                </Text>
                {pipelines.length > 0 ? null : !pipelinesKnown ? (
                  <View
                    className="min-h-12 flex-row items-center gap-2"
                    accessibilityLabel={gt("Loading pipelines")}
                    accessibilityState={{ busy: true }}
                  >
                    <AppActivityIndicator size="small" colorClassName="accent-icon-muted" />
                    <Text className="text-sm text-foreground-muted">
                      <T>Loading pipelines…</T>
                    </Text>
                  </View>
                ) : pipelinesQuery.data === null ? (
                  <Text className="text-sm text-foreground-muted">
                    <T>Couldn't load pipelines.</T>
                  </Text>
                ) : machineState.listEnvironmentId !== environmentId &&
                  listMachineLabel !== null ? (
                  <Text className="text-sm text-foreground-muted">
                    <T>
                      No pipelines on <Var>{listMachineLabel}</Var>. Choose another machine.
                    </T>
                  </Text>
                ) : (
                  <Text className="text-sm text-foreground-muted">
                    <T>No pipelines yet. Create one in T3 Code on your computer.</T>
                  </Text>
                )}
                {pipelines.map((candidate) => {
                  const selected = candidate.id === pipeline?.id;
                  return (
                    <Pressable
                      key={candidate.id}
                      accessibilityRole="radio"
                      accessibilityLabel={candidate.name}
                      accessibilityState={{ selected }}
                      onPress={() => setPipelineChoice(candidate)}
                      className="min-h-12 flex-row items-center gap-3 border-t border-border-subtle py-2"
                    >
                      <View
                        className={cn(
                          "size-5 items-center justify-center rounded-full",
                          selected ? "bg-primary" : "border border-input-border",
                        )}
                      >
                        {selected ? (
                          <SymbolView
                            name="checkmark"
                            size={13}
                            tintColorClassName="accent-primary-foreground"
                          />
                        ) : null}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm font-t3-medium text-foreground">
                          {candidate.id === lastUsedId
                            ? gt("{name}  ·  Last used", { name: candidate.name })
                            : candidate.name}
                        </Text>
                        <Text className="text-xs text-foreground-muted">
                          {candidate.steps.map((step) => step.name).join(" → ")}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                {unmatchedName !== null && pipeline !== null ? (
                  <Text className="pt-1 text-xs text-foreground-muted">
                    {listMachineLabel !== null ? (
                      <T>
                        "<Var>{unmatchedName}</Var>" isn't on <Var>{listMachineLabel}</Var>, so{" "}
                        <Var>{pipeline.name}</Var> is selected.
                      </T>
                    ) : (
                      <T>
                        "<Var>{unmatchedName}</Var>" isn't on this machine, so{" "}
                        <Var>{pipeline.name}</Var> is selected.
                      </T>
                    )}
                  </Text>
                ) : null}
              </View>

              <View className="gap-2">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-sm font-t3-medium text-foreground">
                    {gt("Input", { $context: "pipeline input text" })}
                  </Text>
                  {edited !== null ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setEdited(null)}
                      hitSlop={12}
                    >
                      <Text className="text-sm text-primary">
                        <T>Reset edits</T>
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <SegmentedControl
                  size="compact"
                  options={[
                    { value: "preview", label: gt("Preview", { $context: "tab, rendered view" }) },
                    { value: "edit", label: gt("Edit", { $context: "tab, edit the text" }) },
                  ]}
                  selected={tab}
                  onSelect={setTab}
                />
                {tab === "preview" ? (
                  <View className="max-h-64 overflow-hidden rounded-xl bg-subtle p-3">
                    <ScrollView nestedScrollEnabled>
                      <PullRequestMarkdown markdown={text} />
                    </ScrollView>
                  </View>
                ) : (
                  <TextInput
                    multiline
                    accessibilityLabel={gt("Pipeline input")}
                    value={text}
                    onChangeText={setEdited}
                    textAlignVertical="top"
                    className="max-h-64 min-h-32 rounded-xl bg-subtle px-4 py-3 text-base"
                  />
                )}
                <Text
                  className={cn(
                    "text-xs",
                    summary.overLimit ? "text-danger-text" : "text-foreground-muted",
                  )}
                >
                  {gt("{size} · the first step receives this as text", { size: summary.sizeLabel })}
                </Text>
              </View>

              <View>
                {machines.length >= 2 ? (
                  <Menu
                    title={gt("Machine")}
                    actions={[
                      {
                        id: "auto",
                        title: gt("Auto balance"),
                        state: machineState.effective === "auto" ? "on" : "off",
                      },
                      ...machines.map((candidate) => ({
                        id: String(candidate.environmentId),
                        title: candidate.label,
                        state:
                          machineState.effective === candidate.environmentId
                            ? ("on" as const)
                            : ("off" as const),
                      })),
                    ]}
                    onPressAction={({ nativeEvent }) => {
                      if (nativeEvent.event === "auto") {
                        // Choosing Auto again re-checks the machines.
                        machineState.choose("auto");
                        auto.recheck();
                        return;
                      }
                      const chosen = machines.find(
                        (candidate) => String(candidate.environmentId) === nativeEvent.event,
                      );
                      if (chosen) machineState.choose(chosen.environmentId);
                    }}
                  >
                    <PickerRow
                      label={gt("Machine")}
                      value={
                        machineState.effective !== "auto"
                          ? (machine?.label ?? gt("Choose a machine"))
                          : auto.state.kind === "checking"
                            ? gt("Checking machines…")
                            : auto.state.kind === "unavailable"
                              ? gt("Auto balance unavailable. Choose a machine")
                              : gt("Auto balance · {machine}", { machine: machine?.label ?? "" })
                      }
                    />
                  </Menu>
                ) : null}
                <View className="min-h-12 flex-row items-center gap-3 border-t border-border-subtle py-2">
                  <Text className="text-sm text-foreground-muted">
                    <T>Project</T>
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-right text-sm font-t3-medium text-foreground"
                  >
                    {project?.title ?? detail.projectTitle}
                  </Text>
                </View>
                <Menu
                  title={gt("Workspace")}
                  actions={[
                    {
                      id: "worktree",
                      title: branchName
                        ? baseRef
                          ? gt("New worktree · {branch} from {base}", {
                              branch: branchName,
                              base: baseRef,
                            })
                          : gt("New worktree · {branch}", { branch: branchName })
                        : baseRef
                          ? gt("New worktree from {base}", { base: baseRef })
                          : gt("New worktree"),
                      state: workspace === "worktree" ? "on" : "off",
                    },
                    {
                      id: "local",
                      title: gt("Local checkout"),
                      state: workspace === "local" ? "on" : "off",
                    },
                  ]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "worktree" || nativeEvent.event === "local") {
                      setWorkspace(nativeEvent.event);
                    }
                  }}
                >
                  <PickerRow
                    label={gt("Workspace")}
                    value={workspace === "worktree" ? gt("New worktree") : gt("Local checkout")}
                    {...(workspace === "worktree" && branchName ? { hint: branchName } : {})}
                  />
                </Menu>
              </View>

              {machines.length === 0 ? (
                <Text className="text-sm text-foreground-muted">
                  <T>
                    No connected machine can run pipelines for <Var>{detail.projectTitle}</Var>.
                  </T>
                </Text>
              ) : null}
              {error !== null ? <Text className="text-sm text-danger-text">{error}</Text> : null}
              <Text className="text-xs text-foreground-muted">
                <T>Steps use their own models. The run takes text only.</T>
              </Text>
            </>
          )}
        </ScrollView>
      </ScreenContent>
    </View>
  );
}

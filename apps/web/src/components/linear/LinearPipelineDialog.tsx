import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  draftIssueOf,
  pipelineInputSummary,
  pipelineInputText,
  pipelineWorkspaceStrategy,
  readLastUsedPipelineName,
  writeLastUsedPipelineName,
  type LinearLaunchWorkspace,
} from "@t3tools/client-runtime/linear/launch";
import {
  resolvePipelineSelection,
  type PipelineRef,
} from "@t3tools/client-runtime/linear/pipeline-machines";
import { nextPipelineStartAttempt } from "@t3tools/client-runtime/pipeline-start";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, IssueDetail, PipelineDefinition } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { msg, T, useGT, useMessages, Var } from "gt-react";
import { WorkflowIcon } from "lucide-react";
import { useRef, useState } from "react";

import { m } from "~/i18n/messages";
import { randomUUID } from "../../lib/utils";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { vcsEnvironment } from "../../state/vcs";
import { buildThreadRouteParams } from "../../threadRoutes";
import ChatMarkdown from "../ChatMarkdown";
import { useDraftPipelines } from "../chat/useDraftPipelines";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Radio, RadioGroup } from "../ui/radio-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { linkLaunchedIssue } from "./linkLaunchedIssue";
import { useLinearAutoMachine, useLinearPipelineMachines } from "./useLinearPipelineMachines";

/**
 * Starts a pipeline with the issue as its first step's input. The run starts in the project the
 * issue was read through, or that project's counterpart on the machine picked to run it, and its
 * parent thread is linked to the issue there.
 */
export function LinearPipelineDialog({
  environmentId,
  detail,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly detail: IssueDetail;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-2xl">
        <PipelineDialogBody environmentId={environmentId} detail={detail} onClose={onClose} />
      </DialogPopup>
    </Dialog>
  );
}

function MiniStepper({ steps }: { readonly steps: PipelineDefinition["steps"] }) {
  return (
    <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {steps.map((step, index) => (
        <li key={step.id} className="flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden className="h-px w-3 bg-border" /> : null}
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-3xs font-semibold text-primary"
          >
            {index + 1}
          </span>
          <span>{step.name}</span>
        </li>
      ))}
    </ol>
  );
}

function PipelineChoice({
  pipeline,
  selected,
  lastUsed,
}: {
  readonly pipeline: PipelineDefinition;
  readonly selected: boolean;
  readonly lastUsed: boolean;
}) {
  const gt = useGT();
  return (
    <label
      className={`block cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border/70 hover:bg-accent/40"}`}
    >
      <div className="flex items-center gap-2.5">
        <Radio value={pipeline.id} />
        <span className="text-sm font-medium text-foreground">{pipeline.name}</span>
        <span className="text-xs text-muted-foreground">
          {gt("{count, plural, one {{count} step} other {{count} steps}}", {
            count: pipeline.steps.length,
          })}
        </span>
        {lastUsed ? (
          <span className="ms-auto rounded border border-border px-1.5 py-px text-2xs text-muted-foreground">
            <T>Last used</T>
          </span>
        ) : null}
      </div>
      {selected ? (
        <MiniStepper steps={pipeline.steps} />
      ) : (
        <p className="mt-1 ps-6.5 text-xs text-muted-foreground">
          {pipeline.steps.map((step) => step.name).join(" → ")}
        </p>
      )}
    </label>
  );
}

function PipelineDialogBody({
  environmentId,
  detail,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly detail: IssueDetail;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const messages = useMessages();
  const navigate = useNavigate();
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const allProjects = useProjects();
  const issueProject =
    allProjects.find(
      (candidate) => candidate.environmentId === environmentId && candidate.id === detail.projectId,
    ) ?? null;
  const startPipelineRun = useOrchestrationCommand(serverEnvironment.startPipelineRun, {
    reportFailure: false,
  });
  const attemptRef = useRef<ReturnType<typeof nextPipelineStartAttempt> | null>(null);

  const [pipelineChoice, setPipelineChoice] = useState<PipelineRef | null>(null);
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [edited, setEdited] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<LinearLaunchWorkspace>("worktree");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchName = detail.branchName ?? "";

  const lastUsed = readLastUsedPipelineName(storage);
  const machineState = useLinearPipelineMachines(environmentId, issueProject);
  const { machines } = machineState;
  const primaryPipelines = useDraftPipelines(environmentId, true);
  const pipelines = useDraftPipelines(machineState.listEnvironmentId, true);
  const listMachineLabel =
    machines.find((candidate) => candidate.environmentId === machineState.listEnvironmentId)
      ?.label ?? null;
  const { pipeline, unmatchedName, lastUsedId } = resolvePipelineSelection({
    pipelines: pipelines.pipelines,
    primaryPipelines: primaryPipelines.pipelines,
    chosen: pipelineChoice,
    requestedId: null,
    lastUsedName: lastUsed,
  });
  const pipelineId = pipeline?.id ?? null;

  const auto = useLinearAutoMachine({
    machines,
    active: machineState.effective === "auto",
    live: machineState.live,
    pipelineKnown: pipelines.settled,
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
  const isPrimaryRun = machine === null || machine.environmentId === environmentId;

  const projectStatus = useEnvironmentQuery(
    machine !== null && project !== null
      ? vcsEnvironment.status({
          environmentId: machine.environmentId,
          input: { cwd: project.workspaceRoot },
        })
      : null,
  );
  const baseRef = projectStatus.data?.refName ?? null;

  const text = pipelineInputText({ detail, edited });
  const summary = pipelineInputSummary(text, messages);
  const runsInTitle = project?.title ?? issueProject?.title;
  const canStart =
    !pending && pipeline !== null && machine !== null && project !== null && summary.startable;

  const start = async () => {
    if (!canStart || pipeline === null || project === null || machine === null) return;
    setPending(true);
    setError(null);
    const workspaceStrategy = pipelineWorkspaceStrategy({ workspace, baseRef, branchName });
    const attempt = (attemptRef.current = nextPipelineStartAttempt(
      attemptRef.current,
      { pipelineId: pipeline.id, projectId: project.id, input: text, workspace: workspaceStrategy },
      randomUUID,
    ));
    const result = await startPipelineRun({
      environmentId: machine.environmentId,
      input: {
        commandId: attempt.commandId,
        pipelineId: pipeline.id,
        projectId: project.id,
        input: text,
        workspaceStrategy,
        creationSource: "web",
      },
    });
    setPending(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      setError(
        failure instanceof Error ? failure.message : m(msg("Failed to start the pipeline.")),
      );
      return;
    }
    const run = result.value.run;
    writeLastUsedPipelineName(storage, pipeline.name);
    // The run exists; linking it is best effort and never delays or blocks the launch.
    void linkLaunchedIssue({
      environmentId: machine.environmentId,
      issue: draftIssueOf(detail),
      threadId: run.parentThreadId,
      projectId: project.id,
    });
    onClose();
    const parentRef = scopeThreadRef(machine.environmentId, run.parentThreadId);
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: m(msg("Pipeline started")),
        description: isPrimaryRun
          ? m(msg("{pipeline} on {issue}"), { pipeline: pipeline.name, issue: detail.displayKey })
          : m(msg("{pipeline} on {issue} · {machine}"), {
              pipeline: pipeline.name,
              issue: detail.displayKey,
              machine: machine.label,
            }),
      }),
    );
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(parentRef) });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <WorkflowIcon aria-hidden className="size-4 text-muted-foreground" />
          <DialogTitle>
            <T>Run pipeline from issue</T>
          </DialogTitle>
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className="font-mono text-xs">{detail.displayKey}</span>
          <span className="truncate text-foreground">{detail.title}</span>
        </p>
      </DialogHeader>
      <DialogPanel>
        <div className="space-y-4">
          <section className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              <T>Pipeline</T>
            </h3>
            {pipelines.pipelines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {!pipelines.loaded
                  ? gt("Loading pipelines...")
                  : machineState.listEnvironmentId !== environmentId && listMachineLabel !== null
                    ? gt("No pipelines on {machine}. Choose another machine.", {
                        machine: listMachineLabel,
                      })
                    : gt("No pipelines yet. Create one in Settings, then come back.")}
              </p>
            ) : (
              <RadioGroup
                value={pipelineId}
                onValueChange={(value) =>
                  setPipelineChoice(
                    pipelines.pipelines.find((candidate) => candidate.id === value) ?? null,
                  )
                }
              >
                {pipelines.pipelines.map((candidate) => (
                  <PipelineChoice
                    key={candidate.id}
                    pipeline={candidate}
                    selected={candidate.id === pipelineId}
                    lastUsed={candidate.id === lastUsedId}
                  />
                ))}
              </RadioGroup>
            )}
            {unmatchedName !== null && pipeline !== null ? (
              <p role="status" className="text-xs text-muted-foreground">
                {listMachineLabel === null ? (
                  <T>
                    &quot;<Var>{unmatchedName}</Var>&quot; isn&apos;t on this machine, so{" "}
                    <Var>{pipeline.name}</Var> is selected.
                  </T>
                ) : (
                  <T>
                    &quot;<Var>{unmatchedName}</Var>&quot; isn&apos;t on{" "}
                    <Var>{listMachineLabel}</Var>, so <Var>{pipeline.name}</Var> is selected.
                  </T>
                )}
              </p>
            ) : null}
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                <T>
                  Input{" "}
                  <span className="font-normal">
                    · the pipeline&apos;s first step receives this as text
                  </span>
                </T>
              </h3>
              <div className="flex items-center gap-2">
                {edited !== null ? (
                  <Button type="button" variant="ghost" size="xs" onClick={() => setEdited(null)}>
                    <T>Reset edits</T>
                  </Button>
                ) : null}
                <div
                  role="tablist"
                  aria-label={gt("Input view")}
                  className="flex rounded-md bg-muted p-0.5 text-xs"
                >
                  {(["preview", "edit"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={tab === value}
                      onClick={() => setTab(value)}
                      className={`rounded px-2 py-0.5 capitalize ${tab === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"}`}
                    >
                      {value === "preview"
                        ? gt("preview", { $context: "tab showing the rendered input" })
                        : gt("edit", { $context: "tab for editing the input text" })}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/70">
              {tab === "preview" ? (
                <div className="max-h-64 overflow-y-auto p-3 text-sm">
                  <ChatMarkdown text={text} cwd={undefined} />
                </div>
              ) : (
                <Textarea
                  aria-label={gt("Pipeline input")}
                  value={text}
                  onChange={(event) => setEdited(event.target.value)}
                  unstyled
                />
              )}
              <div className="flex items-center justify-end border-t border-border/70 px-3 py-2 text-xs">
                <span
                  className={
                    summary.overLimit ? "text-destructive-foreground" : "text-muted-foreground"
                  }
                >
                  {summary.sizeLabel}
                </span>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            {machines.length >= 2 ? (
              <section className="min-w-0 space-y-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">
                  <T>Machine</T>
                </h3>
                <Select
                  value={machineState.effective as string | null}
                  onValueChange={(value) => {
                    if (value !== null) machineState.choose(value as EnvironmentId | "auto");
                  }}
                >
                  <SelectTrigger aria-label={gt("Machine")} className="w-full">
                    <SelectValue>
                      {() => {
                        if (machineState.effective !== "auto") {
                          return machine?.label ?? gt("Choose a machine");
                        }
                        if (auto.state.kind === "checking") return gt("Checking machines…");
                        if (auto.state.kind === "unavailable") {
                          return gt("Auto balance unavailable. Choose a machine");
                        }
                        return gt("Auto balance · {machine}", { machine: machine?.label ?? "" });
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="start" alignItemWithTrigger={false}>
                    {machineState.autoOffered ? (
                      <SelectItem
                        value="auto"
                        onClick={() => {
                          // Choosing Auto again re-checks the machines, as in the composer.
                          if (machineState.effective !== "auto") return;
                          machineState.choose("auto");
                          auto.recheck();
                        }}
                      >
                        <T>Auto balance</T>
                      </SelectItem>
                    ) : null}
                    {machines.map((candidate) => (
                      <SelectItem key={candidate.environmentId} value={candidate.environmentId}>
                        {candidate.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </section>
            ) : null}
            <section className="min-w-0 space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                <T>Workspace</T>
              </h3>
              <Select
                value={workspace}
                onValueChange={(value) => {
                  if (value === "worktree" || value === "local") setWorkspace(value);
                }}
              >
                <SelectTrigger aria-label={gt("Workspace")} className="w-full">
                  <SelectValue>
                    {() =>
                      workspace === "worktree" ? (
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span>
                            <T>New worktree</T>
                          </span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {branchName}
                          </span>
                        </span>
                      ) : (
                        gt("Local checkout")
                      )
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="start" alignItemWithTrigger={false}>
                  <SelectItem value="worktree">
                    {branchName
                      ? baseRef
                        ? gt("New worktree · {branch} from {base}", {
                            branch: branchName,
                            base: baseRef,
                          })
                        : gt("New worktree · {branch}", { branch: branchName })
                      : baseRef
                        ? gt("New worktree from {base}", { base: baseRef })
                        : gt("New worktree")}
                  </SelectItem>
                  <SelectItem value="local">
                    <T>Local checkout</T>
                  </SelectItem>
                </SelectPopup>
              </Select>
            </section>
          </div>

          {issueProject === null ? (
            <p role="alert" className="text-sm text-destructive">
              <T>The project this issue is read through is not on this machine.</T>
            </p>
          ) : null}
          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogPanel>
      <DialogFooter className="items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {runsInTitle === undefined ? (
            <T>Runs in the issue&apos;s project. Steps use their own models.</T>
          ) : (
            <T>
              Runs in <Var>{runsInTitle}</Var>. Steps use their own models.
            </T>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            <T>Cancel</T>
          </Button>
          <Button type="button" size="sm" disabled={!canStart} onClick={() => void start()}>
            {pending ? <Spinner size="sm" /> : null}
            <T>Start pipeline</T>
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

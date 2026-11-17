import type {
  EnvironmentId,
  PipelineDefinition,
  ProjectId,
  ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentProject } from "../state/models.ts";
import {
  autoBalanceCandidates,
  eligiblePipelineMachines,
  logicalProjectCounterparts,
  pipelineInstanceIds,
  pipelineProvidersReady,
  resolveAutoMachineState,
  resolvePipelineMachineChoice,
  resolvePipelineSelection,
  type PipelineMachine,
  type PipelineMachineInput,
} from "./pipelineMachines.ts";

const env = (id: string) => id as EnvironmentId;
const project = (id: string) => id as ProjectId;

const input = (
  id: string,
  overrides: Partial<PipelineMachineInput> = {},
): PipelineMachineInput => ({
  environmentId: env(id),
  label: id,
  isPrimary: id === "a",
  connected: true,
  supportsPipelines: true,
  canStart: true,
  projectId: project(`p-${id}`),
  ...overrides,
});

describe("logicalProjectCounterparts", () => {
  it("keeps the chosen project on its machine when one repository holds several", () => {
    const inRepo = (environmentId: string, id: string, workspaceRoot: string) =>
      ({
        environmentId: env(environmentId),
        id: project(id),
        workspaceRoot,
        repositoryIdentity: { canonicalKey: "github.com/acme/app" },
      }) as unknown as EnvironmentProject;
    const projects = [
      inRepo("a", "a-root", "/repo"),
      inRepo("a", "a-web", "/repo/apps/web"),
      inRepo("b", "b-root", "/repo"),
    ];
    const counterparts = logicalProjectCounterparts(projects[1]!, projects, {
      sidebarProjectGroupingMode: "repository",
      sidebarProjectGroupingOverrides: {},
    });
    expect(counterparts.get(env("a"))).toBe("a-web");
    expect(counterparts.get(env("b"))).toBe("b-root");
  });
});

describe("eligiblePipelineMachines", () => {
  it("keeps connected, pipeline-capable, permitted machines with the project, primary first", () => {
    const machines = eligiblePipelineMachines([
      input("c"),
      input("b", { connected: false }),
      input("d", { supportsPipelines: false }),
      input("e", { canStart: false }),
      input("f", { projectId: null }),
      input("a"),
    ]);
    expect(machines.map((machine) => machine.environmentId)).toEqual(["a", "c"]);
    expect(machines[1]?.projectId).toBe("p-c");
  });
});

describe("resolvePipelineMachineChoice", () => {
  const machines: ReadonlyArray<PipelineMachine> = eligiblePipelineMachines([
    input("a"),
    input("b"),
  ]);

  it("defaults to Auto only when balancing is on and there is a choice", () => {
    expect(resolvePipelineMachineChoice({ choice: null, machines, autoOffered: true })).toBe(
      "auto",
    );
    expect(resolvePipelineMachineChoice({ choice: null, machines, autoOffered: false })).toBe("a");
    expect(
      resolvePipelineMachineChoice({
        choice: null,
        machines: machines.slice(0, 1),
        autoOffered: true,
      }),
    ).toBe("a");
  });

  it("can offer Auto without defaulting to it", () => {
    const input = { choice: null, machines, autoOffered: true, autoByDefault: false } as const;
    expect(resolvePipelineMachineChoice(input)).toBe("a");
    expect(resolvePipelineMachineChoice({ ...input, choice: "auto" })).toBe("auto");
  });

  it("keeps a manual pick while eligible and drops it when the machine goes away", () => {
    expect(resolvePipelineMachineChoice({ choice: env("b"), machines, autoOffered: true })).toBe(
      "b",
    );
    expect(
      resolvePipelineMachineChoice({
        choice: env("b"),
        machines: machines.slice(0, 1),
        autoOffered: false,
      }),
    ).toBe("a");
    expect(resolvePipelineMachineChoice({ choice: "auto", machines, autoOffered: false })).toBe(
      "a",
    );
  });
});

describe("autoBalanceCandidates", () => {
  const machines = eligiblePipelineMachines([input("a"), input("b"), input("c")]);

  it("drops manual-only machines and machines whose providers are not ready", () => {
    expect(
      autoBalanceCandidates({
        machines,
        weights: { b: 0 },
        defaultWeight: 50,
        providersReady: (machine) => machine.environmentId !== "c",
      }),
    ).toEqual(["a"]);
  });

  it("treats every machine as Normal without weights", () => {
    expect(
      autoBalanceCandidates({
        machines,
        weights: {},
        defaultWeight: 50,
        providersReady: () => true,
      }),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("resolveAutoMachineState", () => {
  it("checks, picks, latches and reports unavailable", () => {
    const base = {
      latched: null,
      pipelineKnown: true,
      pending: false,
      picked: null,
      candidateCount: 2,
    };
    expect(resolveAutoMachineState({ ...base, pending: true })).toEqual({ kind: "checking" });
    expect(resolveAutoMachineState({ ...base, pipelineKnown: false, candidateCount: 0 })).toEqual({
      kind: "checking",
    });
    expect(resolveAutoMachineState({ ...base, picked: env("b") })).toEqual({
      kind: "picked",
      environmentId: "b",
    });
    expect(resolveAutoMachineState(base)).toEqual({ kind: "unavailable" });
    expect(resolveAutoMachineState({ ...base, candidateCount: 0, pending: true })).toEqual({
      kind: "unavailable",
    });
    expect(resolveAutoMachineState({ ...base, latched: env("a"), picked: env("b") })).toEqual({
      kind: "picked",
      environmentId: "a",
    });
  });
});

describe("pipelineProvidersReady", () => {
  const pipeline = {
    steps: [
      { modelSelection: { instanceId: "codex" } },
      { modelSelection: { instanceId: "claude" } },
      { modelSelection: { instanceId: "codex" } },
    ],
  } as unknown as PipelineDefinition;
  const provider = (instanceId: string, overrides: object = {}) =>
    ({
      instanceId,
      enabled: true,
      installed: true,
      status: "ready",
      auth: { status: "authenticated" },
      availability: "available",
      ...overrides,
    }) as unknown as ServerProvider;
  const ready = (providers: ReadonlyArray<ServerProvider>) =>
    pipelineProvidersReady({
      instanceIds: pipelineInstanceIds(pipeline),
      providers,
      settings: null,
      projectId: project("p"),
    });

  it("needs every step's provider ready", () => {
    expect(pipelineInstanceIds(pipeline)).toEqual(["codex", "claude"]);
    expect(ready([provider("codex"), provider("claude")])).toBe(true);
    expect(
      ready([provider("codex"), provider("claude", { auth: { status: "unauthenticated" } })]),
    ).toBe(false);
    expect(ready([provider("codex")])).toBe(false);
  });
});

describe("resolvePipelineSelection", () => {
  const primaryPipelines = [
    { id: "a1", name: "Build" },
    { id: "a2", name: "Ship" },
  ];
  const pipelines = [
    { id: "x1", name: "Review" },
    { id: "x2", name: "Ship" },
    { id: "x3", name: "Ship" },
  ];
  const none = { primaryPipelines, chosen: null, requestedId: null, lastUsedName: null };

  it("keeps the pick by id, else by name with the first match on collisions", () => {
    const pick = (chosen: { id: string; name: string }) =>
      resolvePipelineSelection({ pipelines, ...none, chosen }).pipeline?.id;
    expect(pick({ id: "x3", name: "Ship" })).toBe("x3");
    expect(pick({ id: "a2", name: "Ship" })).toBe("x2");
  });

  it("keeps the primary's default by name on another machine and says when it is missing", () => {
    expect(resolvePipelineSelection({ pipelines, ...none, requestedId: "a2" }).pipeline?.id).toBe(
      "x2",
    );
    expect(resolvePipelineSelection({ pipelines, ...none, requestedId: "x3" }).pipeline?.id).toBe(
      "x3",
    );
    expect(
      resolvePipelineSelection({ pipelines, ...none, lastUsedName: "Ship" }).pipeline?.id,
    ).toBe("x2");
    const lost = resolvePipelineSelection({ pipelines, ...none, lastUsedName: "Review" });
    expect(lost.pipeline?.id).toBe("x1");
    expect(lost.unmatchedName).toBe("Build");
    expect(
      resolvePipelineSelection({
        pipelines,
        ...none,
        chosen: { id: "a1", name: "Build" },
        requestedId: "a2",
      }).unmatchedName,
    ).toBe("Build");
    expect(resolvePipelineSelection({ ...none, pipelines: [], requestedId: "a2" })).toEqual({
      pipeline: null,
      unmatchedName: null,
      lastUsedId: null,
    });
  });

  it("marks one pipeline as last used when names repeat", () => {
    expect(resolvePipelineSelection({ pipelines, ...none, lastUsedName: "Ship" }).lastUsedId).toBe(
      "x2",
    );
  });
});

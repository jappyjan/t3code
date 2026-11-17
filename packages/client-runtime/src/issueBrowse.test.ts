import type {
  EnvironmentId,
  IssueBrowseEntry,
  IssueContainer,
  IssueListResult,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  appendIssueBrowseEntries,
  issueBrowseTeams,
  nestIssueBrowseEntries,
  splitIssueContainers,
} from "./issueBrowse.ts";

const entry = (key: string, parentKey: string | null = null) =>
  ({ key, parentKey }) as unknown as IssueBrowseEntry;

describe("nestIssueBrowseEntries", () => {
  it("puts sub-issues under a parent in the same list and keeps orphans in place", () => {
    const nested = nestIssueBrowseEntries([
      entry("ENG-3", "ENG-1"),
      entry("ENG-1"),
      entry("ENG-4", "ENG-3"),
      entry("ENG-2", "ENG-99"),
      entry("ENG-5", "ENG-1"),
    ]);
    expect(nested.map(({ entry, depth }) => `${entry.key}:${depth}`)).toEqual([
      "ENG-1:0",
      "ENG-3:1",
      "ENG-4:2",
      "ENG-5:1",
      "ENG-2:0",
    ]);
  });

  it("still shows every member of a parent cycle", () => {
    const nested = nestIssueBrowseEntries([entry("A", "B"), entry("B", "A")]);
    expect(nested.map(({ entry }) => entry.key).toSorted()).toEqual(["A", "B"]);
  });
});

describe("appendIssueBrowseEntries", () => {
  it("skips keys a later page repeats", () => {
    const merged = appendIssueBrowseEntries([entry("A"), entry("B")], [entry("B"), entry("C")]);
    expect(merged.map((e) => e.key)).toEqual(["A", "B", "C"]);
  });
});

describe("splitIssueContainers", () => {
  it("moves completed containers aside, keeping order", () => {
    const container = (id: string, completed: boolean) =>
      ({ id, completed }) as unknown as IssueContainer;
    const { active, completed } = splitIssueContainers([
      container("a", false),
      container("b", true),
      container("c", false),
    ]);
    expect(active.map((c) => c.id)).toEqual(["a", "c"]);
    expect(completed.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("issueBrowseTeams", () => {
  it("lists only scopes whose tracker can browse, once per environment", () => {
    const answer = {
      trackers: [
        { tracker: "linear", host: "linear.app", capabilities: { browse: true } },
        { tracker: "github", host: "github.com", capabilities: {} },
      ],
      scopes: [
        { projectId: "p1", tracker: "linear", host: "linear.app", scope: "ENG" },
        { projectId: "p2", tracker: "linear", host: "Linear.app", scope: "eng" },
        { projectId: "p3", tracker: "github", host: "github.com", scope: "acme/app" },
        { projectId: "p4", tracker: "linear", host: "linear.app", scope: "DES" },
      ],
    } as unknown as IssueListResult;
    const teams = issueBrowseTeams([
      ["env-a" as EnvironmentId, answer],
      ["env-b" as EnvironmentId, answer],
    ]);
    expect(teams.map((team) => `${team.environmentId}/${team.scope}/${team.projectId}`)).toEqual([
      "env-a/DES/p4",
      "env-b/DES/p4",
      "env-a/ENG/p1",
      "env-b/ENG/p1",
    ]);
  });
});

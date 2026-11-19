import type {
  EnvironmentId,
  IssueBrowseEntry,
  IssueContainer,
  IssueTrackerConnectionList,
  ProjectId,
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
  it("lists every team of a connected tracker, served by its bound project or any other", () => {
    const answer = {
      trackers: [
        {
          tracker: "linear",
          host: "linear.app",
          connected: true,
          account: "jan",
          scopes: [
            { key: "ENG", name: "Engineering" },
            { key: "DES", name: "Design" },
          ],
        },
        { tracker: "jira", host: "jira.example", connected: true, account: null, scopes: [] },
      ],
      bindings: { p2: { tracker: "linear", scope: "eng" } },
    } as unknown as IssueTrackerConnectionList;
    const projects = [
      { environmentId: "env-a" as EnvironmentId, id: "p1" as ProjectId },
      { environmentId: "env-a" as EnvironmentId, id: "p2" as ProjectId },
      { environmentId: "env-b" as EnvironmentId, id: "p3" as ProjectId },
    ];
    const teams = issueBrowseTeams(
      [
        ["env-a" as EnvironmentId, answer],
        ["env-b" as EnvironmentId, answer],
        // An environment without projects has nothing to serve the reads.
        ["env-c" as EnvironmentId, answer],
      ],
      projects,
    );
    expect(teams.map((team) => `${team.environmentId}/${team.scope}/${team.projectId}`)).toEqual([
      "env-a/DES/p1",
      "env-b/DES/p3",
      "env-a/ENG/p2",
      "env-b/ENG/p3",
    ]);
  });
});

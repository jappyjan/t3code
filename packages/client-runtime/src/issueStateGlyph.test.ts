import type { IssueState, IssueStateType } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { issueStateGlyph } from "./issueStateGlyph.ts";

const TYPES: ReadonlyArray<IssueStateType> = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
  "duplicate",
];
const colorOf = (state: IssueState, scheme: "light" | "dark") =>
  issueStateGlyph(state, scheme)!.color;
const fillOf = (state: IssueState) => {
  const pie = issueStateGlyph(state, "light")!.primitives.find((p) => p.key === "pie");
  return pie?.tag === "path" ? pie.d : null;
};

const state = (type: IssueStateType, extra: Partial<IssueState> = {}): IssueState => ({
  category: type === "completed" || type === "canceled" || type === "duplicate" ? "closed" : "open",
  name: type,
  type,
  ...extra,
});

describe("issueStateGlyph", () => {
  it("draws each Linear type with its own shape", () => {
    const shapes = Object.fromEntries(
      TYPES.map((type) => [
        type,
        issueStateGlyph(state(type), "light")!.primitives.map((primitive) =>
          primitive.tag === "circle"
            ? `${primitive.fill === null ? "ring" : "disc"}${primitive.dash ? "-dashed" : ""}`
            : primitive.fill === null
              ? "mark"
              : "pie",
        ),
      ]),
    );
    expect(shapes).toEqual({
      triage: ["disc", "mark"],
      backlog: ["ring-dashed"],
      unstarted: ["ring"],
      started: ["ring", "pie"],
      completed: ["disc", "mark"],
      canceled: ["disc", "mark"],
      duplicate: ["disc", "mark"],
    });
  });

  it("keeps the done and not-done marks apart", () => {
    const mark = (type: IssueStateType) =>
      issueStateGlyph(state(type), "light")!.primitives.find((p) => p.tag === "path");
    expect(mark("completed")).not.toEqual(mark("canceled"));
    expect(mark("canceled")).toEqual(mark("duplicate"));
  });

  it("leaves a tracker without workflow types to its open and closed marks", () => {
    expect(issueStateGlyph({ category: "open", name: "Open" }, "light")).toBeNull();
  });

  it("fills a started state by its place on the workflow, half when unknown", () => {
    const path = (fill?: number) =>
      fillOf(state("started", fill === undefined ? {} : { startedFill: fill }));
    expect(path(0.75)).toContain("A3 3 0 1 1 5.000 8.000");
    expect(path(0.25)).toContain("A3 3 0 0 1 11.000 8.000");
    expect(path()).toContain("A3 3 0 0 1 8.000 11.000");
    expect(path(0)).toEqual(path());
    expect(path(1)).toEqual(path());
  });

  it("uses the state colour, else the type's, and drops one the theme would lose", () => {
    expect(colorOf(state("completed", { color: "#26b5ce" }), "light")).toBe("#26b5ce");
    expect(colorOf(state("started"), "dark")).toBe("#f2c94c");
    expect(colorOf(state("unstarted", { color: "#e2e2e2" }), "light")).toBe("#9ca3af");
    expect(colorOf(state("unstarted", { color: "#e2e2e2" }), "dark")).toBe("#e2e2e2");
    expect(colorOf(state("completed", { color: "#101010" }), "dark")).toBe("#9ca3af");
    expect(colorOf(state("started", { color: "#f2c94c" }), "light")).toBe("#f2c94c");
    expect(colorOf(state("backlog", { color: "nonsense" }), "light")).toBe("#bec2c8");
    // Every type has a fallback colour of its own.
    expect(new Set(TYPES.map((type) => colorOf(state(type), "light"))).size).toBeGreaterThan(4);
  });
});

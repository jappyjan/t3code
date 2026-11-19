import { describe, expect, it } from "vite-plus/test";

import { issueBrowseFromUrl } from "./issueBrowse.logic";

describe("issueBrowseFromUrl", () => {
  const team = { environmentId: "env", projectId: "p1", tracker: "linear", scope: "ENG" };

  it("keeps each level only when the one above it is whole", () => {
    expect(issueBrowseFromUrl(undefined)).toBeUndefined();
    expect(issueBrowseFromUrl("yes")).toEqual({});
    expect(issueBrowseFromUrl({ ...team, tracker: "Not A Kind" })).toEqual({});
    expect(issueBrowseFromUrl({ ...team, milestone: { id: "m", name: "Beta" } })).toEqual(team);
    expect(
      issueBrowseFromUrl({
        ...team,
        project: { id: "pr", name: " Launch " },
        milestone: { id: "m", name: "" },
      }),
    ).toEqual({ ...team, project: { id: "pr", name: "Launch" } });
  });
});

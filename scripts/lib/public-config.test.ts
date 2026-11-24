// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env"), "T3CODE_PORT=1\nT3CODE_HOST=root\n");
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env.local"), "T3CODE_PORT=2\n");

    expect(loadRepoEnv({ baseEnv: {}, repoRoot })).toMatchObject({
      T3CODE_PORT: "2",
      T3CODE_HOST: "root",
    });
    expect(loadRepoEnv({ baseEnv: { T3CODE_PORT: "3" }, repoRoot }).T3CODE_PORT).toBe("3");
  });

  it("drops T3 Connect, Clerk, and hosted tracing values from every source", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env"),
      "T3CODE_RELAY_URL=https://relay.example.test\nVITE_CLERK_PUBLISHABLE_KEY=pk_root\n",
    );

    const env = loadRepoEnv({
      baseEnv: {
        T3CODE_CLERK_PUBLISHABLE_KEY: "pk_ci",
        EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID: "google",
        VITE_T3CODE_RELAY_URL: "https://relay.example.test",
        T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN: "token",
        VITE_RELAY_OTLP_TRACES_URL: "https://traces.example.test",
        EXPO_PUBLIC_OTLP_TRACES_DATASET: "mobile",
        T3CODE_MOBILE_OTLP_TRACES_URL: "https://traces.example.test",
        T3CODE_PORT: "3773",
      },
      repoRoot,
    });

    expect(env).toEqual({ T3CODE_PORT: "3773" });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

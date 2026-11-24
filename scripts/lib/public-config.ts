// @effect-diagnostics nodeBuiltinImport:off - Build bootstrap reads optional root env files before an Effect runtime exists.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

type Environment = Readonly<Record<string, string | undefined>>;

const REPO_ROOT = NodePath.resolve(NodeURL.fileURLToPath(import.meta.url), "../../..");

// This fork builds without T3 Connect and hosted tracing: no relay, no Clerk sign-in, and no
// Axiom export, whatever the environment or the root env files hold.
const CONNECT_AND_HOSTED_TRACING_KEY =
  /^(?:(?:T3CODE|VITE|EXPO_PUBLIC)_CLERK_|(?:T3CODE_|VITE_T3CODE_)RELAY_URL$|(?:T3CODE_MOBILE|EXPO_PUBLIC)_OTLP_TRACES_|(?:T3CODE_RELAY_CLIENT|VITE_RELAY)_OTLP_TRACES_)/;

export function loadRepoEnv({
  baseEnv = process.env,
  repoRoot = REPO_ROOT,
}: {
  readonly baseEnv?: Environment;
  readonly repoRoot?: string;
} = {}): Record<string, string | undefined> {
  const merged = {
    ...readEnvFile(NodePath.join(repoRoot, ".env")),
    ...readEnvFile(NodePath.join(repoRoot, ".env.local")),
    ...baseEnv,
  };
  return Object.fromEntries(
    Object.entries(merged).filter(([key]) => !CONNECT_AND_HOSTED_TRACING_KEY.test(key)),
  );
}

function readEnvFile(path: string): Record<string, string | undefined> {
  return NodeFS.existsSync(path) ? NodeUtil.parseEnv(NodeFS.readFileSync(path, "utf8")) : {};
}

/**
 * The fork's old Linear page kept its API key as the settings secret `linear-api-key`. Upstream's
 * Linear tracker reads its own credential, so the old key moves there once and is then removed,
 * which keeps a later disconnect from bringing it back.
 *
 * @module issue/legacyLinearKey
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { IssueTrackerKind } from "@t3tools/contracts";

import type * as ServerSecretStore from "../auth/ServerSecretStore.ts";

export const LEGACY_LINEAR_KEY_SECRET = "linear-api-key";

export const adoptLegacyLinearKey = Effect.fn("adoptLegacyLinearKey")(function* (
  secrets: ServerSecretStore.ServerSecretStore["Service"],
  secretName: (tracker: IssueTrackerKind) => string,
) {
  const legacy = yield* secrets.get(LEGACY_LINEAR_KEY_SECRET);
  if (Option.isNone(legacy)) return;
  const target = secretName(IssueTrackerKind.make("linear"));
  if (Option.isNone(yield* secrets.get(target)) && legacy.value.length > 0) {
    yield* secrets.set(target, legacy.value);
  }
  yield* secrets.remove(LEGACY_LINEAR_KEY_SECRET);
});

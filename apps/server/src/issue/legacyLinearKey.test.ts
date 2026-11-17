import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { issueTrackerSecretName } from "./IssueTrackerHostLive.ts";
import { adoptLegacyLinearKey, LEGACY_LINEAR_KEY_SECRET } from "./legacyLinearKey.ts";

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const text = (value: Option.Option<Uint8Array>) =>
  Option.map(value, (stored) => new TextDecoder().decode(stored));

function memoryStore(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial).map(([name, value]) => [name, bytes(value)]));
  const store = {
    get: (name: string) => Effect.succeed(Option.fromNullishOr(values.get(name))),
    set: (name: string, value: Uint8Array<ArrayBuffer>) =>
      Effect.sync(() => void values.set(name, value)),
    remove: (name: string) => Effect.sync(() => void values.delete(name)),
  } as unknown as ServerSecretStore.ServerSecretStore["Service"];
  return { store, values };
}

const LINEAR_SECRET = issueTrackerSecretName("linear" as never);

describe("adoptLegacyLinearKey", () => {
  it.effect("moves the old key to the Linear tracker's credential and removes it", () =>
    Effect.gen(function* () {
      const { store, values } = memoryStore({ [LEGACY_LINEAR_KEY_SECRET]: "lin_api_old" });
      yield* adoptLegacyLinearKey(store, issueTrackerSecretName);
      expect(text(Option.fromNullishOr(values.get(LINEAR_SECRET)))).toEqual(
        Option.some("lin_api_old"),
      );
      expect(values.has(LEGACY_LINEAR_KEY_SECRET)).toBe(false);
    }),
  );

  it.effect("keeps a key already connected through Settings", () =>
    Effect.gen(function* () {
      const { store, values } = memoryStore({
        [LEGACY_LINEAR_KEY_SECRET]: "lin_api_old",
        [LINEAR_SECRET]: "lin_api_new",
      });
      yield* adoptLegacyLinearKey(store, issueTrackerSecretName);
      expect(text(Option.fromNullishOr(values.get(LINEAR_SECRET)))).toEqual(
        Option.some("lin_api_new"),
      );
      expect(values.has(LEGACY_LINEAR_KEY_SECRET)).toBe(false);
    }),
  );
});

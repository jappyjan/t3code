import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { chooseLoadBalancedEnvironment } from "@t3tools/client-runtime/load-balancing";
import {
  createHostResourcesAtom,
  DEFAULT_LOAD_BALANCING_WEIGHT,
  selectLoadBalancedFromHostResources,
} from "@t3tools/client-runtime/state/host-resources-balancing";
import { executeAtomQuery } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useContext } from "react";

import { serverEnvironment } from "../state/server";

const hostResourcesAtom = createHostResourcesAtom(serverEnvironment.hostResources);

/** Only mounted for unresolved automatic picks, so idle clients do not poll hosts. */
export function useLoadBalancedEnvironment(
  environmentIds: readonly EnvironmentId[],
  weights: Readonly<Record<string, number>>,
) {
  const registry = useContext(RegistryContext);
  const refresh = (ids: readonly EnvironmentId[]) => {
    for (const environmentId of ids) {
      registry.refresh(serverEnvironment.hostResources({ environmentId, input: {} }));
    }
  };
  const refreshSelection = async (ids: readonly EnvironmentId[]) => {
    const candidates = await Promise.all(
      ids.map(async (environmentId) => {
        const result = await executeAtomQuery(
          registry,
          serverEnvironment.hostResources({ environmentId, input: {} }),
          { refresh: true, reportFailure: false, signal: AbortSignal.timeout(5_000) },
        );
        return {
          environmentId,
          resources: result._tag === "Success" ? result.value : null,
          receivedAt: Date.now(),
          weight: weights[environmentId] ?? DEFAULT_LOAD_BALANCING_WEIGHT,
        };
      }),
    );
    return chooseLoadBalancedEnvironment(candidates, Date.now()) as EnvironmentId | null;
  };
  const snapshot = useAtomValue(hostResourcesAtom(environmentIds.join("\n")));
  return { refresh, refreshSelection, ...selectLoadBalancedFromHostResources(snapshot, weights) };
}

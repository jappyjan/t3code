import { useAtomValue } from "@effect/atom-react";
import {
  createIssueTrackerEnvironmentAtoms,
  createMergedIssueTrackerConnectionsAtoms,
} from "@t3tools/client-runtime/state/issue-trackers";
import type { EnvironmentId } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { formatEnvironmentQueryError } from "./query";

export const issueTrackerEnvironment = createIssueTrackerEnvironmentAtoms(connectionAtomRuntime);

const mergedConnections = createMergedIssueTrackerConnectionsAtoms(
  issueTrackerEnvironment.connections,
  formatEnvironmentQueryError,
);

/** Every environment's standalone trackers, read together for the teams Issues can browse. */
export function useIssueTrackerConnections(environmentIds: ReadonlyArray<EnvironmentId>) {
  const view = useAtomValue(mergedConnections.atom(environmentIds));
  return { ...view, refresh: () => mergedConnections.refresh(appAtomRegistry, environmentIds) };
}

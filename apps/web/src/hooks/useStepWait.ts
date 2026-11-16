import { minuteTickToEpochMs } from "@t3tools/client-runtime/clock";
import {
  possiblyStuckClock,
  threadBackgroundWait,
} from "@t3tools/client-runtime/state/pipeline-nesting";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";

import { useServerConfigs } from "../state/entities";
import { useNowMinute } from "./useNowMinute";

/** What a step thread waits on after its turn ended, by the rule the sidebar uses, on the shared minute clock. */
export function useStepWait(environmentId: EnvironmentId) {
  const config = useServerConfigs().get(environmentId);
  const nowMinute = useNowMinute();
  const clock = possiblyStuckClock(config?.settings, minuteTickToEpochMs(nowMinute));
  return {
    stuckAfterHours: clock?.afterHours,
    waitOf: (shell: EnvironmentThreadShell | null) =>
      shell === null ? null : threadBackgroundWait(shell, clock),
  };
}

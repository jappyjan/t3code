import type { HostAdmissionState, OrchestrationV2AdmissionWait } from "@t3tools/contracts";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";

/** Why a queued run waits for the host; counts are omitted when the host's state is unknown. */
export function hostAdmissionWaitReason(
  wait: OrchestrationV2AdmissionWait | undefined,
  admission: HostAdmissionState | undefined,
  resolve: MFunctionType = mFallback,
): string | null {
  if (wait === "capacity") {
    return admission?.maxRunningTurns
      ? resolve(
          msg("Waiting for a free slot ({running}/{max} running)", {
            running: admission.runningTurns,
            max: admission.maxRunningTurns,
          }),
        )
      : resolve(msg("Waiting for a free slot"));
  }
  if (wait === "host_load") {
    return admission?.pacing === "severe"
      ? resolve(msg("Waiting for the host: memory is critically low"))
      : resolve(msg("Starting turns one at a time while the host is busy"));
  }
  return null;
}

/** Why the host holds new turns right now; the cap comes first, as on the server. */
export function hostAdmissionHoldReason(
  admission: HostAdmissionState,
  resolve: MFunctionType = mFallback,
): string | null {
  const atCap =
    admission.maxRunningTurns !== null && admission.runningTurns >= admission.maxRunningTurns;
  return hostAdmissionWaitReason(
    atCap ? "capacity" : admission.pacing === null ? undefined : "host_load",
    admission,
    resolve,
  );
}

export function hostAdmissionWaitingLabel(
  admission: HostAdmissionState,
  resolve: MFunctionType = mFallback,
): string {
  return resolve(
    msg("{count, plural, one {{count} turn waiting} other {{count} turns waiting}}", {
      count: admission.waitingTurns,
    }),
  );
}

/** "2 turns waiting · 4/4 running" */
export function hostAdmissionSummary(
  admission: HostAdmissionState,
  resolve: MFunctionType = mFallback,
): string {
  return admission.maxRunningTurns === null
    ? resolve(
        msg(
          "{count, plural, one {{count} turn waiting} other {{count} turns waiting}} · {running} running",
          { count: admission.waitingTurns, running: admission.runningTurns },
        ),
      )
    : resolve(
        msg(
          "{count, plural, one {{count} turn waiting} other {{count} turns waiting}} · {running}/{max} running",
          {
            count: admission.waitingTurns,
            running: admission.runningTurns,
            max: admission.maxRunningTurns,
          },
        ),
      );
}

/** "4 running · 2 waiting" */
export function hostAdmissionCounts(
  admission: HostAdmissionState,
  resolve: MFunctionType = mFallback,
): string {
  return resolve(
    msg("{running} running · {waiting} waiting", {
      running: admission.runningTurns,
      waiting: admission.waitingTurns,
    }),
  );
}

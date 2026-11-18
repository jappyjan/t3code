import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  hostAdmissionHoldReason,
  hostAdmissionSummary,
  hostAdmissionWaitingLabel,
} from "@t3tools/client-runtime/host-admission-presentation";
import type { EnvironmentId, HostAdmissionState, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useGT, useMessages } from "gt-react";
import { ClockIcon } from "lucide-react";
import { memo } from "react";

import { useServerConfigs, useThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Button, InlineButton } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";

/** Turns held by the host's admission limits would otherwise look like stuck threads. */
export const SidebarHostAdmissionPill = memo(function SidebarHostAdmissionPill() {
  const configs = useServerConfigs();
  const waiting = [...configs].flatMap(([environmentId, config]) =>
    config.hostAdmission !== undefined && config.hostAdmission.waitingTurns > 0
      ? [{ environmentId, label: config.environment.label, admission: config.hostAdmission }]
      : [],
  );
  return (
    <>
      {waiting.map((entry) => (
        <HostAdmissionPill
          key={entry.environmentId}
          environmentId={entry.environmentId}
          label={configs.size > 1 ? entry.label : null}
          admission={entry.admission}
        />
      ))}
    </>
  );
});

function HostAdmissionPill(props: {
  readonly environmentId: EnvironmentId;
  readonly label: string | null;
  readonly admission: HostAdmissionState;
}) {
  const { admission } = props;
  const gt = useGT();
  const messages = useMessages();
  const waitingLabel = hostAdmissionWaitingLabel(admission, messages);
  const summary = hostAdmissionSummary(admission, messages);
  const title =
    props.label === null
      ? waitingLabel
      : gt("{environment}: {status}", { environment: props.label, status: waitingLabel });
  const reason = hostAdmissionHoldReason(admission, messages);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost-muted"
            size="compact"
            data-host-admission={props.environmentId}
            className="w-full shrink-0 justify-start"
          />
        }
      >
        <ClockIcon />
        <span className="min-w-0 truncate">
          {props.label === null
            ? summary
            : gt("{environment}: {status}", { environment: props.label, status: summary })}
        </span>
      </PopoverTrigger>
      <PopoverPopup side="top" align="start" padding="compact">
        <div className="w-72 max-w-full">
          <PopoverTitle>{title}</PopoverTitle>
          <p className="mt-1 text-2xs text-muted-foreground">
            {reason === null
              ? gt("Start one now from its thread.")
              : gt("{reason}. Start one now from its thread.", { reason })}
          </p>
          <ul className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto">
            {admission.waitingThreadIds.map((threadId) => (
              <WaitingThreadRow
                key={threadId}
                environmentId={props.environmentId}
                threadId={threadId}
              />
            ))}
          </ul>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function WaitingThreadRow(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const threadRef = scopeThreadRef(props.environmentId, props.threadId);
  const thread = useThreadShell(threadRef);
  return (
    <li className="flex min-w-0 text-xs">
      <InlineButton
        className="min-w-0 max-w-full"
        onClick={() =>
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(threadRef),
          })
        }
      >
        <span className="truncate">{thread?.title ?? gt("Untitled thread")}</span>
      </InlineButton>
    </li>
  );
}

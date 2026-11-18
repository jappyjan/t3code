import type { PipelineDefinition, PipelineId } from "@t3tools/contracts";
import { describePipelineSteps } from "@t3tools/client-runtime/pipeline-editor";
import { useNavigate } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import { WorkflowIcon } from "lucide-react";
import { memo } from "react";

import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon, type ComposerControlSize } from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";

const NO_PIPELINE_VALUE = "";

/**
 * The composer's Pipeline chip. A selected pipeline replaces the model, traits and mode controls:
 * each step brings its own, and the run takes the draft's text only.
 */
export const ComposerPipelinePicker = memo(function ComposerPipelinePicker(props: {
  pipelines: ReadonlyArray<PipelineDefinition>;
  pipelinesLoaded: boolean;
  selectedPipelineId: PipelineId | null;
  disabled: boolean;
  size: ComposerControlSize;
  onSelect: (pipelineId: PipelineId | null) => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const navigate = useNavigate();
  const composerFloatingLayerProps = useComposerMenuProps();
  const selected = props.pipelines.find((pipeline) => pipeline.id === props.selectedPipelineId);
  const pending = props.selectedPipelineId !== null && !selected && !props.pipelinesLoaded;
  const label =
    props.selectedPipelineId === null
      ? gt("Pipeline")
      : (selected?.name ?? (pending ? gt("Loading pipeline") : gt("Pipeline unavailable")));
  const tooltip = selected
    ? gt("{name}: {steps}. The run takes text only.", {
        name: selected.name,
        steps: describePipelineSteps(selected.steps, m),
      })
    : props.selectedPipelineId === null
      ? gt("Run a pipeline of agent steps instead of one model")
      : pending
        ? gt("Loading pipelines")
        : gt("This pipeline no longer exists. Choose another or none.");

  return (
    <div data-resting-controls-fixed className="flex shrink-0 items-center">
      {/* Non-modal like the model picker: a modal menu locks page scroll and lays a backdrop over the composer. */}
      <Menu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                disabled={props.disabled}
                render={
                  <ComposerControl
                    size={props.size}
                    aria-label={gt("Pipeline: {label}", { label })}
                    aria-pressed={props.selectedPipelineId !== null}
                    data-composer-pipeline-chip
                  />
                }
              />
            }
          >
            <ComposerControlIcon icon={WorkflowIcon} size={props.size} />
            <span data-composer-control-label className="max-w-40 truncate">
              {label}
            </span>
          </TooltipTrigger>
          <TooltipPopup side="top">{tooltip}</TooltipPopup>
        </Tooltip>
        <MenuPopup align="start" {...composerFloatingLayerProps}>
          <MenuRadioGroup
            value={props.selectedPipelineId ?? NO_PIPELINE_VALUE}
            onValueChange={(value) =>
              props.onSelect(
                value === NO_PIPELINE_VALUE
                  ? null
                  : (props.pipelines.find((pipeline) => pipeline.id === value)?.id ?? null),
              )
            }
          >
            <MenuRadioItem value={NO_PIPELINE_VALUE}>
              {gt("None", { $context: "no pipeline selected" })}
            </MenuRadioItem>
            {props.pipelines.map((pipeline) => (
              <MenuRadioItem key={pipeline.id} value={pipeline.id}>
                <span className="block truncate">{pipeline.name}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {describePipelineSteps(pipeline.steps, m)}
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem onClick={() => void navigate({ to: "/settings/pipelines" })}>
            <T>Manage pipelines…</T>
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
});

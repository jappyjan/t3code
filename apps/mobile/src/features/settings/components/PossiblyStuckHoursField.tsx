import { MAX_POSSIBLY_STUCK_AFTER_HOURS } from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { NumberField } from "../../../components/ui/NumberField";

export type PossiblyStuckHoursFieldProps = Pick<
  ComponentProps<typeof NumberField>,
  "value" | "onValueChange" | "disabled"
>;

export function PossiblyStuckHoursField(props: PossiblyStuckHoursFieldProps) {
  return (
    <NumberField
      {...props}
      min={0}
      max={MAX_POSSIBLY_STUCK_AFTER_HOURS}
      label="Hours before a thread is marked possibly stuck"
      formatValue={(value) => (value === 0 ? "Off" : `${value} ${value === 1 ? "hour" : "hours"}`)}
    />
  );
}

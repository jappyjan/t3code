import { MAX_MAX_RUNNING_TURNS, MIN_MAX_RUNNING_TURNS } from "@t3tools/contracts";
import { useGT } from "gt-react-native";
import type { ComponentProps } from "react";
import { NumberField } from "../../../components/ui/NumberField";

export type HostCapacityTurnsFieldProps = Pick<
  ComponentProps<typeof NumberField>,
  "value" | "onValueChange" | "disabled"
>;

export function HostCapacityTurnsField(props: HostCapacityTurnsFieldProps) {
  const gt = useGT();
  return (
    <NumberField
      {...props}
      min={MIN_MAX_RUNNING_TURNS}
      max={MAX_MAX_RUNNING_TURNS}
      label={gt("Maximum running turns")}
      formatValue={(value) =>
        gt("{count, plural, one {{count} turn} other {{count} turns}}", { count: value })
      }
    />
  );
}

import { MAX_POSSIBLY_STUCK_AFTER_HOURS } from "@t3tools/contracts";
import { useGT } from "gt-react-native";
import type { ComponentProps } from "react";
import { NumberField } from "../../../components/ui/NumberField";

export type PossiblyStuckHoursFieldProps = Pick<
  ComponentProps<typeof NumberField>,
  "value" | "onValueChange" | "disabled"
>;

export function PossiblyStuckHoursField(props: PossiblyStuckHoursFieldProps) {
  const gt = useGT();
  return (
    <NumberField
      {...props}
      min={0}
      max={MAX_POSSIBLY_STUCK_AFTER_HOURS}
      label={gt("Hours before a thread is marked possibly stuck")}
      formatValue={(value) =>
        value === 0
          ? gt("Off", { $context: "setting disabled" })
          : gt("{count, plural, one {{count} hour} other {{count} hours}}", { count: value })
      }
    />
  );
}

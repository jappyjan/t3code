import { useAtomValue } from "@effect/atom-react";
import { withPipelineExpanded } from "@t3tools/client-runtime/state/pipeline-nesting";
import { AsyncResult } from "effect/reactivity";

import { mobilePreferencesAtom, saveMobilePreferences } from "../../state/preferences";
import { useAtomCommand } from "../../state/use-atom-command";

// Pipelines start collapsed, so only the latest expansions are worth keeping.
const MAX_EXPANDED_PIPELINES = 200;
const NO_EXPANDED_PIPELINES: readonly string[] = [];

export function useThreadListV2ShelfPreferences() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const snoozedShelfExpanded =
    loaded && preferencesResult.value.threadListSnoozedShelfExpanded === true;
  const settledShelfExpanded =
    loaded && preferencesResult.value.threadListSettledShelfExpanded === true;
  const workingShelfEnabled = loaded && preferencesResult.value.workingShelfEnabled !== false;
  const workingShelfExpanded =
    loaded && preferencesResult.value.threadListWorkingShelfExpanded === true;
  const expandedPipelineKeys =
    (loaded ? preferencesResult.value.threadListExpandedPipelines : undefined) ??
    NO_EXPANDED_PIPELINES;

  // Transforms read optimistic state so same-frame presses toggle twice.
  const toggleSnoozedShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListSnoozedShelfExpanded: current.threadListSnoozedShelfExpanded !== true,
      }),
    });
  };
  const toggleSettledShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListSettledShelfExpanded: current.threadListSettledShelfExpanded !== true,
      }),
    });
  };
  const toggleWorkingShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListWorkingShelfExpanded: current.threadListWorkingShelfExpanded !== true,
      }),
    });
  };
  const togglePipelineExpanded = (threadKey: string) => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => {
        const keys = current.threadListExpandedPipelines ?? [];
        return {
          threadListExpandedPipelines: withPipelineExpanded(
            keys,
            threadKey,
            !keys.includes(threadKey),
            MAX_EXPANDED_PIPELINES,
          ),
        };
      },
    });
  };

  return {
    loaded,
    settledShelfExpanded,
    snoozedShelfExpanded,
    workingShelfEnabled,
    workingShelfExpanded,
    expandedPipelineKeys,
    toggleSettledShelf,
    toggleSnoozedShelf,
    toggleWorkingShelf,
    togglePipelineExpanded,
  } as const;
}

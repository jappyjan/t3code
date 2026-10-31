import { useNavigation } from "@react-navigation/native";
import { useEffect, useRef } from "react";
import { BackHandler, Keyboard, View, type TextInputInstance } from "react-native";

import { SearchField } from "../../components/ui/SearchField";
import { useToolbarLayout } from "../../components/ui/useToolbarLayout";
import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { openSettings } from "../settings/settings-navigation";
import { WorkspaceListToolbarRow } from "../workspace/WorkspaceListToolbarRow";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";

/** Linear search shares the thread list's Android header row; it is the workspace jump search. */
export function LinearToolbar() {
  const navigation = useNavigation();
  const workspace = useWorkspaceTabs()!;
  const { dispatch, getScrollOffset, recordScrollOffset, isTabActive } = workspace;
  const tab = workspace.state.tabs.linear;
  const input = useRef<TextInputInstance>(null);
  const searching = tab.searchMode !== "resting";
  const openSearch = () => {
    dispatch({ type: "scroll", tab: "linear", offset: getScrollOffset("linear") });
    dispatch({ type: "search", tab: "linear" });
    input.current?.focus();
    return true;
  };
  useHardwareKeyboardCommand("focusSearch", openSearch);
  const closeSearch = () => {
    Keyboard.dismiss();
    recordScrollOffset("linear", tab.searchEntryOffset);
    dispatch({ type: "cancel", tab: "linear" });
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to BackHandler while searching to close the Linear search on Android back
  useEffect(() => {
    if (!searching) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Frozen Home screens stay mounted under a detail route or another tab,
      // so back only applies while the Linear tab is in front.
      const state = navigation.getState();
      if (!state || state.routes[state.index]?.name !== "Home" || !isTabActive("linear"))
        return false;
      if (Keyboard.isVisible()) Keyboard.dismiss();
      else closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [searching, closeSearch, navigation, isTabActive]);
  const { paddingTop, paddingBottom } = useToolbarLayout();
  return (
    <View className="bg-header px-2" style={{ paddingTop, paddingBottom }}>
      <WorkspaceListToolbarRow
        searching={searching}
        searchField={
          <SearchField
            inputRef={input}
            accessibilityLabel="Search issues"
            clearAccessibilityLabel="Clear search"
            placeholder="Search issues"
            value={tab.query}
            onChangeText={(query) => dispatch({ type: "query", tab: "linear", query })}
          />
        }
        onCloseSearch={closeSearch}
        onOpenSearch={openSearch}
        searchAccessibilityLabel="Search issues"
        titleAccessibilityLabel="T3 Code, Linear"
        onOpenEnvironments={() => openSettings(navigation, "SettingsEnvironments")}
        filter={null}
      />
    </View>
  );
}

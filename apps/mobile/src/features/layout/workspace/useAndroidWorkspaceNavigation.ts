import { StackActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { BackHandler, Keyboard, Platform } from "react-native";
import { returnToAndroidWorkspaceList } from "../../../lib/android-workspace-navigation";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";

export function useWorkspaceBackNavigation() {
  const navigation = useNavigation();
  return () => {
    if (Platform.OS === "android") returnToAndroidWorkspaceList(navigation);
    else if (navigation.canGoBack()) navigation.goBack();
    else navigation.dispatch(StackActions.replace("Home"));
  };
}

/**
 * Keeps a pushed page's tab selected on Android, so Back from a deep link lands on that tab's
 * list rather than whichever tab was showing.
 */
export function useAndroidWorkspaceTab(tab: WorkspaceTab) {
  const dispatch = useWorkspaceTabs()?.dispatch;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "android") dispatch?.({ type: "select", tab });
    }, [dispatch, tab]),
  );
}

export function useAndroidWorkspaceBack() {
  const goBack = useWorkspaceBackNavigation();
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (Keyboard.isVisible()) Keyboard.dismiss();
        else goBack();
        return true;
      });
      return () => subscription.remove();
    }, [goBack]),
  );
  return goBack;
}

import type { EnvironmentIssueEntry } from "@t3tools/client-runtime/issue-list";
import { useGT } from "gt-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";

import { RelativeTime } from "../../components/RelativeTime";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { ListRowLabel } from "../pull-requests/PullRequestListRow";
import { PullRequestAvatar } from "../pull-requests/PullRequestPresentation";
import {
  selectedThreadRowColors,
  THREAD_LIST_V2_SIDEBAR_ROW_CONTAINER_STYLE,
  THREAD_LIST_V2_SIDEBAR_ROW_STYLE,
} from "../threads/thread-list-v2-row-appearance";
import { issueStatus } from "./issuePresentation";

export const IssueListRow = memo(function IssueListRow(props: {
  readonly item: EnvironmentIssueEntry;
  readonly onSelect: (item: EnvironmentIssueEntry) => void;
  readonly selected: boolean;
  readonly sidebar: boolean;
  /** Browse nests a sub-issue under its parent. */
  readonly depth?: number;
  readonly subIssueCount?: number;
  readonly blocked?: boolean;
}) {
  const gt = useGT();
  const { item } = props;
  const foreground = props.selected
    ? selectedThreadRowColors.foregroundClassName
    : props.sidebar
      ? "text-drawer-foreground"
      : "text-foreground";
  const muted = props.selected
    ? selectedThreadRowColors.mutedForegroundClassName
    : props.sidebar
      ? "text-drawer-foreground-muted"
      : "text-foreground-muted";
  const status = issueStatus(item.state);
  const subIssueCount = props.subIssueCount ?? 0;
  return (
    <View style={props.sidebar ? THREAD_LIST_V2_SIDEBAR_ROW_CONTAINER_STYLE : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: props.selected }}
        accessibilityLabel={[
          gt("Issue {key}", { key: item.displayKey }),
          item.title,
          status.label,
          gt("by {author}", { author: item.author?.login ?? gt("unknown author") }),
          item.labels.length ? item.labels.map((label) => label.name).join(", ") : null,
          item.commentCount
            ? gt("{count, plural, one {{count} comment} other {{count} comments}}", {
                count: item.commentCount,
              })
            : null,
          props.blocked ? gt("blocked", { $context: "issue state" }) : null,
          subIssueCount
            ? gt("{count, plural, other {{count} sub-issues}}", { count: subIssueCount })
            : null,
        ]
          .filter(Boolean)
          .join(", ")}
        onPress={() => props.onSelect(item)}
        style={props.sidebar ? THREAD_LIST_V2_SIDEBAR_ROW_STYLE : undefined}
        className={cn(
          "flex-row gap-3 overflow-hidden",
          !props.sidebar && "px-4 active:bg-row-hover",
          props.sidebar && "bg-drawer",
          props.sidebar && !props.selected && "active:bg-thread-hover",
          props.selected && "bg-thread-selected",
        )}
      >
        <View
          className={cn("self-start", props.sidebar ? "pt-0.5" : "pt-2.5")}
          style={props.depth ? { marginLeft: props.depth * 20 } : undefined}
        >
          <SymbolView name={status.icon} size={20} tintColorClassName={status.tint} />
        </View>
        <View
          className={cn(
            "min-w-0 flex-1 gap-1",
            !props.sidebar && "border-b border-border-subtle py-2.5",
          )}
        >
          <View className="flex-row items-center gap-1.5">
            <PullRequestAvatar actor={item.author} size={16} />
            <Text className={cn("min-w-0 flex-1 text-xs", muted)} numberOfLines={1}>
              {/* A Linear key already names its team; a git host's number needs the repository. */}
              {item.displayKey.startsWith(`${item.scope}-`)
                ? item.displayKey
                : `${item.scope} ${item.displayKey}`}
            </Text>
            <Text className={cn("text-2xs tabular-nums", muted)}>
              <RelativeTime timestamp={item.updatedAt} />
            </Text>
          </View>
          <Text
            className={cn("text-base leading-5 font-t3-medium", foreground)}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>
          {item.labels.length > 0 || item.commentCount > 0 || props.blocked || subIssueCount > 0 ? (
            <View className="flex-row items-center gap-1.5">
              <View className="min-w-0 flex-1 flex-row items-center gap-1">
                {item.labels.slice(0, 2).map((label) => (
                  <ListRowLabel key={label.name} label={label} textClassName={muted} />
                ))}
                {item.labels.length > 2 ? (
                  <Text className={cn("shrink-0 text-2xs", muted)}>+{item.labels.length - 2}</Text>
                ) : null}
              </View>
              {props.blocked ? (
                <Text className="shrink-0 rounded-full bg-danger/15 px-1.5 text-2xs font-t3-medium text-danger-foreground">
                  Blocked
                </Text>
              ) : null}
              {subIssueCount > 0 ? (
                <View className="shrink-0 flex-row items-center gap-1">
                  <SymbolView name="list.number" size={12} tintColorClassName="accent-icon-muted" />
                  <Text className={cn("text-2xs tabular-nums", muted)}>{subIssueCount}</Text>
                </View>
              ) : null}
              {item.commentCount > 0 ? (
                <View className="shrink-0 flex-row items-center gap-1">
                  <SymbolView name="bubble.left" size={12} tintColorClassName="accent-icon-muted" />
                  <Text className={cn("text-2xs tabular-nums", muted)}>{item.commentCount}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

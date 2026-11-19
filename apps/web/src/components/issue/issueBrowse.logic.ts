import { IssueTrackerKind, type EnvironmentId, type ProjectId } from "@t3tools/contracts";
import type { IssueBrowseTeam } from "@t3tools/client-runtime/issue-browse";
import * as Schema from "effect/Schema";

export interface IssueBrowseCrumb {
  readonly id: string;
  readonly name: string;
}

/**
 * Where the browse view stands, kept in the URL as one `browse` object. Present at all means the
 * page is browsing; a team is named by the T3 project that reads it, so the read needs no list.
 */
export interface IssueBrowsePosition {
  readonly environmentId?: EnvironmentId;
  readonly projectId?: ProjectId;
  readonly tracker?: IssueTrackerKind;
  readonly host?: string;
  readonly scope?: string;
  /** The tracker's project, by id and the name the breadcrumb shows. */
  readonly project?: IssueBrowseCrumb;
  readonly milestone?: IssueBrowseCrumb;
}

const isTrackerKind = Schema.is(IssueTrackerKind);

const text = (value: unknown): string | undefined =>
  typeof value === "number"
    ? String(value)
    : typeof value === "string" && value.trim()
      ? value.trim().slice(0, 200)
      : undefined;

const crumb = (value: unknown): IssueBrowseCrumb | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = text(record.id);
  const name = text(record.name);
  return id && name ? { id, name } : undefined;
};

/** Each level needs the one above it: a malformed team drops back to the teams. */
export function issueBrowseFromUrl(raw: unknown): IssueBrowsePosition | undefined {
  if (typeof raw !== "object" || raw === null) return raw === undefined ? undefined : {};
  const record = raw as Record<string, unknown>;
  const environmentId = text(record.environmentId);
  const projectId = text(record.projectId);
  const scope = text(record.scope);
  const tracker = isTrackerKind(record.tracker) ? record.tracker : undefined;
  if (!environmentId || !projectId || !scope || !tracker) return {};
  const host = text(record.host);
  const project = crumb(record.project);
  const milestone = project ? crumb(record.milestone) : undefined;
  return {
    environmentId: environmentId as EnvironmentId,
    projectId: projectId as ProjectId,
    tracker,
    ...(host ? { host } : {}),
    scope,
    ...(project ? { project } : {}),
    ...(milestone ? { milestone } : {}),
  };
}

export function issueBrowseTeamOf(position: IssueBrowsePosition): IssueBrowseTeam | null {
  const { environmentId, projectId, tracker, scope } = position;
  if (!environmentId || !projectId || !tracker || !scope) return null;
  return { environmentId, projectId, tracker, host: position.host, scope };
}

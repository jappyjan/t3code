import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Creates the multi-repo project schema, which upstream ships as numbered migrations. It runs after
 * the numbered migrations because the migrator skips every id up to the highest recorded one, so a
 * fork-only id would swallow the upstream migration that later takes it. Names match upstream so
 * its migrations find the schema in place. Idempotent on every start.
 */
export const ensureMultiRepoSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const projectColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;
  if (!projectColumns.some((column) => column.name === "tracked_folders_json")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN tracked_folders_json TEXT NOT NULL DEFAULT '[]'
    `;
  }

  // Earlier fork builds kept task folders in another shape; set those rows aside, never drop them.
  const taskFolderColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(task_folders)
  `;
  if (
    taskFolderColumns.length > 0 &&
    !taskFolderColumns.some((column) => column.name === "real_root")
  ) {
    yield* sql`ALTER TABLE task_folders RENAME TO task_folders_fork_v1`;
    yield* sql`DROP INDEX IF EXISTS idx_task_folders_project_id`;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_task_folders_fork_v1_project_id
      ON task_folders_fork_v1 (project_id)
    `;
  }

  // Keyed by folder: subagents, forks and reused worktrees share one path across threads.
  yield* sql`
    CREATE TABLE IF NOT EXISTS task_folders (
      root TEXT PRIMARY KEY,
      real_root TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_root TEXT NOT NULL,
      anchor TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_is_worktree INTEGER NOT NULL,
      repositories_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_task_folders_real_root ON task_folders (real_root)`;
});

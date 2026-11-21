import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Earlier fork builds kept task folders in another shape, which upstream's migration 105 cannot
 * index. Runs before the numbered migrations and sets those rows aside; it never drops them.
 */
export const setAsideForkTaskFolders = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const taskFolderColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(task_folders)
  `;
  if (
    taskFolderColumns.length === 0 ||
    taskFolderColumns.some((column) => column.name === "real_root")
  ) {
    return;
  }
  yield* sql`ALTER TABLE task_folders RENAME TO task_folders_fork_v1`;
  yield* sql`DROP INDEX IF EXISTS idx_task_folders_project_id`;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_task_folders_fork_v1_project_id
    ON task_folders_fork_v1 (project_id)
  `;
});

/**
 * Repairs what earlier fork builds of the multi-repo schema left behind; the schema itself comes
 * from upstream's numbered migrations. Runs after them, idempotent on every start.
 */
export const ensureMultiRepoSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Earlier fork builds gave repository checkpoint scopes their own kind, which no longer decodes
  // and fails the whole thread. Their rows already carry the `repositoryPath` that marks them now.
  const repositoryScopes = yield* sql`
    SELECT 1 FROM orchestration_v2_projection_checkpoint_scopes WHERE kind = 'repository' LIMIT 1
  `;
  if (repositoryScopes.length > 0) {
    yield* sql`
      UPDATE orchestration_v2_projection_checkpoint_scopes
      SET kind = 'manual', payload_json = json_set(payload_json, '$.kind', 'manual')
      WHERE kind = 'repository'
    `;
  }
});

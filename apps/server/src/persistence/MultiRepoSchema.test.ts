import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { ensureMultiRepoSchema } from "./MultiRepoSchema.ts";
import { migrationManifest, runMigrations } from "./Migrations.ts";

const readShape = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projectColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;
  const taskFolderColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(task_folders)`;
  const objects = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE name LIKE '%task_folders%' ORDER BY name
  `;
  return {
    trackedFolders: projectColumns.some((column) => column.name === "tracked_folders_json"),
    taskFolderColumns: taskFolderColumns.map((column) => column.name),
    objects: objects.map((object) => object.name),
  };
});

const currentShape = {
  trackedFolders: true,
  taskFolderColumns: [
    "root",
    "real_root",
    "project_id",
    "project_root",
    "anchor",
    "project_path",
    "project_is_worktree",
    "repositories_json",
    "created_at",
  ],
  objects: ["idx_task_folders_real_root", "sqlite_autoindex_task_folders_1", "task_folders"],
};

const insertTaskFolder = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    INSERT INTO task_folders (
      root, real_root, project_id, project_root, anchor, project_path, project_is_worktree, created_at
    )
    VALUES ('/tasks/a', '/tasks/a', 'project-1', '/code/app', '/code', '/tasks/a/app', 1, 'now')
  `;
});

describe("Multi-repo schema", () => {
  it.effect("is created on every start without recording a migration id", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      yield* insertTaskFolder;
      assert.deepStrictEqual(yield* runMigrations(), []);
      yield* ensureMultiRepoSchema;
      assert.deepStrictEqual(yield* readShape, currentShape);
      assert.strictEqual((yield* sql`SELECT * FROM task_folders`).length, 1);
      const [latest] = yield* sql<{ readonly migration_id: number }>`
        SELECT MAX(migration_id) AS migration_id FROM effect_sql_migrations
      `;
      assert.strictEqual(latest?.migration_id, migrationManifest.at(-1)?.[0]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("sets aside a task folder table an earlier fork build created", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: migrationManifest.at(-1)?.[0] });
      yield* sql`
        ALTER TABLE projection_projects
        ADD COLUMN tracked_folders_json TEXT NOT NULL DEFAULT '[]'
      `;
      yield* sql`
        CREATE TABLE task_folders (
          root TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          home_worktree_path TEXT NOT NULL,
          repositories_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
      yield* sql`CREATE INDEX idx_task_folders_project_id ON task_folders (project_id)`;
      yield* sql`
        INSERT INTO task_folders (root, project_id, home_worktree_path, repositories_json, created_at, updated_at)
        VALUES ('/tasks/old', 'project-1', '/tasks/old/home', '[]', 'then', 'then')
      `;

      yield* runMigrations();
      yield* runMigrations();

      assert.deepStrictEqual(yield* readShape, {
        ...currentShape,
        objects: [
          "idx_task_folders_fork_v1_project_id",
          "idx_task_folders_real_root",
          "sqlite_autoindex_task_folders_1",
          "sqlite_autoindex_task_folders_fork_v1_1",
          "task_folders",
          "task_folders_fork_v1",
        ],
      });
      assert.deepStrictEqual(
        yield* sql`SELECT root, home_worktree_path FROM task_folders_fork_v1`,
        [{ root: "/tasks/old", home_worktree_path: "/tasks/old/home" }],
      );
      yield* insertTaskFolder;
      assert.deepStrictEqual(yield* sql`SELECT root FROM task_folders`, [{ root: "/tasks/a" }]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});

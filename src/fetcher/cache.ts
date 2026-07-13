import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type CacheRow = {
  uri: string;
  raw: Buffer;
  fetchedAt: string;
  hashComputed: string;
};

type RawRow = { uri: string; raw: Buffer; fetched_at: string; hash_computed: string };

let dbInstance: Database.Database | null = null;
let dbInstancePath: string | null = null;

function defaultCachePath(): string {
  const dir = process.env["CACHE_DIR"];
  const resolvedDir =
    dir && dir.length > 0 ? dir : path.join(os.homedir(), ".cache", "mcp-8004-bridge");
  return path.join(resolvedDir, "cache.sqlite");
}

/**
 * Lazily opens (and memoizes) the sqlite cache db. Memoization is keyed on the
 * resolved path so tests can point `override` at a fresh temp file per test without
 * bleeding state across cases.
 */
export function getCacheDb(override?: string): Database.Database {
  const resolvedPath = override ?? defaultCachePath();
  if (dbInstance && dbInstancePath === resolvedPath) {
    return dbInstance;
  }
  if (dbInstance) {
    dbInstance.close();
  }
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS registration_files (
      uri TEXT PRIMARY KEY,
      raw BLOB NOT NULL,
      fetched_at TEXT NOT NULL,
      hash_computed TEXT NOT NULL
    )
  `);
  dbInstance = db;
  dbInstancePath = resolvedPath;
  return db;
}

export function getCachedFile(uri: string, override?: string): CacheRow | undefined {
  const db = getCacheDb(override);
  const row = db
    .prepare("SELECT uri, raw, fetched_at, hash_computed FROM registration_files WHERE uri = ?")
    .get(uri) as RawRow | undefined;
  if (!row) {
    return undefined;
  }
  return { uri: row.uri, raw: row.raw, fetchedAt: row.fetched_at, hashComputed: row.hash_computed };
}

export function setCachedFile(
  uri: string,
  raw: Uint8Array,
  fetchedAt: string,
  hashComputed: string,
  override?: string,
): void {
  const db = getCacheDb(override);
  db.prepare(
    `INSERT INTO registration_files (uri, raw, fetched_at, hash_computed)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET
       raw = excluded.raw,
       fetched_at = excluded.fetched_at,
       hash_computed = excluded.hash_computed`,
  ).run(uri, Buffer.from(raw), fetchedAt, hashComputed);
}

/** Test-only: closes and drops the memoized db handle so a new path takes effect. */
export function resetCacheForTests(): void {
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = null;
  dbInstancePath = null;
}

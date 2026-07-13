import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCachedFile,
  getCacheDb,
  resetCacheForTests,
  setCachedFile,
} from "../../src/fetcher/cache.js";

let tmpDir: string;
let cachePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "mcp-8004-cache-unit-"));
  cachePath = path.join(tmpDir, "cache.sqlite");
  resetCacheForTests();
});

afterEach(() => {
  resetCacheForTests();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("fetcher cache", () => {
  it("returns undefined for a uri that was never cached", () => {
    expect(getCachedFile("ipfs://missing", cachePath)).toBeUndefined();
  });

  it("round-trips raw bytes, fetchedAt, and hashComputed", () => {
    const raw = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    setCachedFile(
      "https://example.com/a.json",
      raw,
      "2026-01-01T00:00:00.000Z",
      "0xabc",
      cachePath,
    );

    const row = getCachedFile("https://example.com/a.json", cachePath);
    expect(row).toBeDefined();
    expect(row?.fetchedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(row?.hashComputed).toBe("0xabc");
    expect(new Uint8Array(row?.raw ?? Buffer.alloc(0))).toEqual(raw);
  });

  it("upserts on repeated writes to the same uri", () => {
    const uri = "https://example.com/a.json";
    setCachedFile(
      uri,
      new TextEncoder().encode("v1"),
      "2026-01-01T00:00:00.000Z",
      "0x1",
      cachePath,
    );
    setCachedFile(
      uri,
      new TextEncoder().encode("v2"),
      "2026-01-02T00:00:00.000Z",
      "0x2",
      cachePath,
    );

    const row = getCachedFile(uri, cachePath);
    expect(row?.hashComputed).toBe("0x2");
    expect(Buffer.from(row?.raw ?? Buffer.alloc(0)).toString("utf8")).toBe("v2");

    const count = getCacheDb(cachePath)
      .prepare("SELECT COUNT(*) as c FROM registration_files")
      .get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("creates the registration_files table with the spec'd schema", () => {
    const db = getCacheDb(cachePath);
    const columns = db.prepare("PRAGMA table_info(registration_files)").all() as Array<{
      name: string;
    }>;
    const names = columns.map((c) => c.name).sort();
    expect(names).toEqual(["fetched_at", "hash_computed", "raw", "uri"].sort());
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isOk } from "../../src/shared/result.js";
import { validRegistrationBytes, notJsonBytes } from "../fixtures/index.js";

const { fetchRegistrationFile } = await import("../../src/fetcher/fetch.js");
const { resetCacheForTests } = await import("../../src/fetcher/cache.js");

async function cidForBytes(bytes: Uint8Array): Promise<string> {
  const hash = await sha256.digest(bytes);
  return CID.create(1, raw.code, hash).toString();
}

function jsonResponse(body: Uint8Array, status = 200): Response {
  return new Response(body, { status });
}

let tmpDir: string;
let cachePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "mcp-8004-cache-"));
  cachePath = path.join(tmpDir, "cache.sqlite");
  resetCacheForTests();
});

afterEach(() => {
  resetCacheForTests();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("fetchRegistrationFile", () => {
  it("T-1: ipfs URI, first gateway 500s, second succeeds -> source: ipfs", async () => {
    const bytes = validRegistrationBytes();
    const cid = await cidForBytes(bytes);
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("ipfs.io")) {
        return new Response("boom", { status: 500 });
      }
      return jsonResponse(bytes);
    }) as typeof fetch;

    const result = await fetchRegistrationFile(`ipfs://${cid}`, { fetchImpl, cachePath });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.source).toBe("ipfs");
      expect(result.value.verified).toBe(true);
    }
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("ipfs.io");
    expect(calls[1]).toContain("cloudflare-ipfs.com");
  });

  it("T-2: all gateways fail -> FILE_UNREACHABLE, retryable, message lists gateways", async () => {
    const cid = await cidForBytes(validRegistrationBytes());
    const fetchImpl = (async () => new Response("nope", { status: 502 })) as typeof fetch;

    const result = await fetchRegistrationFile(`ipfs://${cid}`, { fetchImpl, cachePath });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_UNREACHABLE");
      expect(result.error.retryable).toBe(true);
      expect(result.error.message).toContain("ipfs.io");
      expect(result.error.message).toContain("cloudflare-ipfs.com");
      expect(result.error.message).toContain("gateway.pinata.cloud");
    }
  });

  it("T-3: >2MiB response aborted mid-stream -> FILE_UNREACHABLE mentioning size cap", async () => {
    const bigChunk = new Uint8Array(1024 * 1024); // 1 MiB per chunk
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let i = 0; i < 3; i += 1) {
          controller.enqueue(bigChunk);
        }
        controller.close();
      },
    });
    const fetchImpl = (async () => new Response(stream, { status: 200 })) as typeof fetch;

    const result = await fetchRegistrationFile("https://example.com/big.json", {
      fetchImpl,
      cachePath,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_UNREACHABLE");
      expect(result.error.message.toLowerCase()).toContain("size cap");
    }
  });

  it("T-4: ipfs CID match -> verified:true; corrupted bytes vs CID -> verified:false", async () => {
    const bytes = validRegistrationBytes();
    const cid = await cidForBytes(bytes);

    const goodFetch = (async () => jsonResponse(bytes)) as typeof fetch;
    const goodResult = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl: goodFetch,
      cachePath,
    });
    expect(isOk(goodResult)).toBe(true);
    if (isOk(goodResult)) {
      expect(goodResult.value.verified).toBe(true);
    }

    resetCacheForTests();
    const corrupted = new Uint8Array(bytes);
    corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;
    const badFetch = (async () => jsonResponse(corrupted)) as typeof fetch;
    const badResult = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl: badFetch,
      cachePath: path.join(tmpDir, "cache2.sqlite"),
    });
    expect(isOk(badResult)).toBe(true);
    if (isOk(badResult)) {
      expect(badResult.value.verified).toBe(false);
    }
  });

  it("T-5a: https fetch -> verified:null", async () => {
    const bytes = validRegistrationBytes();
    const fetchImpl = (async () => jsonResponse(bytes)) as typeof fetch;
    const result = await fetchRegistrationFile("https://example.com/agent.json", {
      fetchImpl,
      cachePath,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.verified).toBeNull();
      expect(result.value.source).toBe("https");
    }
  });

  it("T-5b: data: URI -> source: data, verified: true, decoded content, no cache write", async () => {
    const payload = Buffer.from('{"name":"inline agent","active":true}', "utf8").toString("base64");
    const uri = `data:application/json;base64,${payload}`;
    const result = await fetchRegistrationFile(uri, { cachePath });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.source).toBe("data");
      expect(result.value.verified).toBe(true);
      expect(result.value.content).toEqual({ name: "inline agent", active: true });
      expect(result.value.contentError).toBeNull();
    }

    const { getCachedFile } = await import("../../src/fetcher/cache.js");
    expect(getCachedFile(uri, cachePath)).toBeUndefined();
  });

  it("T-5c: non-JSON content over https surfaces contentError: not-json but keeps raw/hash", async () => {
    const bytes = notJsonBytes();
    const fetchImpl = (async () => jsonResponse(bytes)) as typeof fetch;
    const result = await fetchRegistrationFile("https://example.com/not-json.txt", {
      fetchImpl,
      cachePath,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.content).toBeNull();
      expect(result.value.contentError).toBe("not-json");
      expect(result.value.raw.length).toBe(bytes.length);
      expect(result.value.hashComputed).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("unsupported scheme -> FILE_UNREACHABLE naming the scheme", async () => {
    const result = await fetchRegistrationFile("ftp://example.com/agent.json", { cachePath });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_UNREACHABLE");
      expect(result.error.message).toContain("ftp");
    }
  });

  it("T-6: warm cache hit returns source: cache and re-verifies; tampered row -> verified:false", async () => {
    const bytes = validRegistrationBytes();
    const cid = await cidForBytes(bytes);
    const fetchImpl = (async () => jsonResponse(bytes)) as typeof fetch;

    const first = await fetchRegistrationFile(`ipfs://${cid}`, { fetchImpl, cachePath });
    expect(isOk(first)).toBe(true);

    let secondFetchCalled = false;
    const shouldNotBeCalled = (async () => {
      secondFetchCalled = true;
      return jsonResponse(bytes);
    }) as typeof fetch;

    const second = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl: shouldNotBeCalled,
      cachePath,
    });
    expect(secondFetchCalled).toBe(false);
    expect(isOk(second)).toBe(true);
    if (isOk(second)) {
      expect(second.value.source).toBe("cache");
      expect(second.value.verified).toBe(true);
    }

    // Tamper directly with the cached row's raw bytes via SQL.
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(cachePath);
    const tampered = Buffer.from(bytes);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    db.prepare("UPDATE registration_files SET raw = ? WHERE uri = ?").run(
      tampered,
      `ipfs://${cid}`,
    );
    db.close();

    const third = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl: shouldNotBeCalled,
      cachePath,
    });
    expect(secondFetchCalled).toBe(false);
    expect(isOk(third)).toBe(true);
    if (isOk(third)) {
      expect(third.value.source).toBe("cache");
      expect(third.value.verified).toBe(false);
    }
  });

  it("T-7: TTL expiry (injected clock) triggers a refetch", async () => {
    const bytes = validRegistrationBytes();
    const cid = await cidForBytes(bytes);
    let fetchCount = 0;
    const fetchImpl = (async () => {
      fetchCount += 1;
      return jsonResponse(bytes);
    }) as typeof fetch;

    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const first = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl,
      cachePath,
      now: () => t0,
    });
    expect(isOk(first)).toBe(true);
    expect(fetchCount).toBe(1);

    // Within TTL (30 min later): should still be a cache hit.
    const within = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl,
      cachePath,
      now: () => new Date(t0.getTime() + 30 * 60 * 1000),
    });
    expect(isOk(within)).toBe(true);
    if (isOk(within)) {
      expect(within.value.source).toBe("cache");
    }
    expect(fetchCount).toBe(1);

    // Past TTL (61 min later): should refetch.
    const after = await fetchRegistrationFile(`ipfs://${cid}`, {
      fetchImpl,
      cachePath,
      now: () => new Date(t0.getTime() + 61 * 60 * 1000),
    });
    expect(isOk(after)).toBe(true);
    if (isOk(after)) {
      expect(after.value.source).toBe("ipfs");
    }
    expect(fetchCount).toBe(2);
  });
});

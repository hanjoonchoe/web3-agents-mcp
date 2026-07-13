import { keccak256 } from "viem";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, ok } from "../shared/result.js";
import { getCachedFile, setCachedFile } from "./cache.js";
import { verifyCid } from "./cid.js";
import { gatewayUrl, parseIpfsUri, resolveGateways } from "./gateways.js";

export type FileSource = "ipfs" | "https" | "data" | "cache";

export type FetchedFile = {
  content: unknown;
  raw: Uint8Array;
  verified: boolean | null;
  source: FileSource;
  fetchedAt: string;
  hashComputed: `0x${string}`;
  contentError: "not-json" | null;
};

export type FetchOptions = {
  /** Injectable fetch implementation, for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock, for TTL tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Overrides the sqlite cache file path, for tests. Defaults to CACHE_DIR env / ~/.cache/... */
  cachePath?: string;
  /** Overrides the IPFS gateway list, for tests. Defaults to IPFS_GATEWAYS env / built-in defaults. */
  gateways?: string[];
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function parseJsonContent(raw: Uint8Array): { content: unknown; contentError: "not-json" | null } {
  try {
    const text = Buffer.from(raw).toString("utf8");
    const content = JSON.parse(text) as unknown;
    return { content, contentError: null };
  } catch {
    return { content: null, contentError: "not-json" };
  }
}

/**
 * Fetches raw bytes from a single URL with a 10s per-attempt timeout and a 2 MiB size
 * cap enforced while streaming (aborts as soon as the cap is exceeded, rather than
 * buffering the whole response first).
 */
async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Result<Uint8Array>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      return err(
        bridgeError("FILE_UNREACHABLE", `${url} responded with HTTP ${response.status}`, {
          retryable: true,
        }),
      );
    }

    const body = response.body;
    if (!body) {
      const buf = new Uint8Array(await response.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        return err(
          bridgeError("FILE_UNREACHABLE", `${url} exceeded the 2 MiB size cap`, {
            retryable: true,
          }),
        );
      }
      return ok(buf);
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          controller.abort();
          return err(
            bridgeError("FILE_UNREACHABLE", `${url} exceeded the 2 MiB size cap while streaming`, {
              retryable: true,
            }),
          );
        }
        chunks.push(value);
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return ok(out);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(bridgeError("FILE_UNREACHABLE", `${url}: ${message}`, { retryable: true, cause }));
  } finally {
    clearTimeout(timer);
  }
}

function parseDataUri(uri: string): Result<Uint8Array> {
  // data:[<mediatype>][;base64],<data>
  const match = /^data:([^,]*),([\s\S]*)$/.exec(uri);
  if (!match) {
    return err(bridgeError("FILE_UNREACHABLE", "malformed data: URI"));
  }
  const meta = match[1] ?? "";
  const payload = match[2] ?? "";
  const isBase64 = /;base64$/i.test(meta);
  try {
    if (isBase64) {
      return ok(new Uint8Array(Buffer.from(payload, "base64")));
    }
    return ok(new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf8")));
  } catch (cause) {
    return err(bridgeError("FILE_UNREACHABLE", "failed to decode data: URI", { cause }));
  }
}

// data: URIs carry their own content on-chain (in the tokenUri itself) — there is
// nothing to verify against, no network round trip, and no cache entry (WP-3 spec R-2/R-4).
function handleData(uri: string, now: () => Date): Result<FetchedFile> {
  const parsed = parseDataUri(uri);
  if (!parsed.ok) {
    return parsed;
  }
  const raw = parsed.value;
  const hashComputed = keccak256(raw);
  const { content, contentError } = parseJsonContent(raw);
  return ok({
    content,
    raw,
    verified: true,
    source: "data",
    fetchedAt: now().toISOString(),
    hashComputed,
    contentError,
  });
}

/**
 * Shared cache-then-fetch-then-verify flow for the ipfs:// and https:// schemes.
 * Cache hits recompute the keccak256 hash AND re-run `verify` against the cached
 * bytes (not the stored hash) so a tampered cache row surfaces as verified:false
 * rather than trusting whatever was written at insert time (WP-3 spec R-4).
 */
async function fetchWithCache(
  uri: string,
  source: "ipfs" | "https",
  doFetch: () => Promise<Result<Uint8Array>>,
  verify: (raw: Uint8Array) => Promise<boolean | null>,
  opts: FetchOptions,
): Promise<Result<FetchedFile>> {
  const now = opts.now ?? (() => new Date());

  const cached = getCachedFile(uri, opts.cachePath);
  if (cached) {
    const ageMs = now().getTime() - new Date(cached.fetchedAt).getTime();
    if (ageMs < CACHE_TTL_MS) {
      const raw = new Uint8Array(cached.raw);
      const verified = await verify(raw);
      const hashComputed = keccak256(raw);
      const { content, contentError } = parseJsonContent(raw);
      return ok({
        content,
        raw,
        verified,
        source: "cache",
        fetchedAt: cached.fetchedAt,
        hashComputed,
        contentError,
      });
    }
  }

  const fetched = await doFetch();
  if (!fetched.ok) {
    return fetched;
  }
  const raw = fetched.value;
  const fetchedAt = now().toISOString();
  const hashComputed = keccak256(raw);
  setCachedFile(uri, raw, fetchedAt, hashComputed, opts.cachePath);
  const verified = await verify(raw);
  const { content, contentError } = parseJsonContent(raw);
  return ok({ content, raw, verified, source, fetchedAt, hashComputed, contentError });
}

async function handleIpfs(uri: string, opts: FetchOptions): Promise<Result<FetchedFile>> {
  const parsed = parseIpfsUri(uri);
  if (!parsed) {
    return err(bridgeError("FILE_UNREACHABLE", `malformed ipfs URI: ${uri}`));
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const gateways = resolveGateways(opts.gateways);
  const attempted: string[] = [];

  const doFetch = async (): Promise<Result<Uint8Array>> => {
    for (const gateway of gateways) {
      const url = gatewayUrl(gateway, parsed);
      attempted.push(url);
      const result = await fetchBytes(url, fetchImpl);
      if (result.ok) {
        return result;
      }
    }
    return err(
      bridgeError(
        "FILE_UNREACHABLE",
        `all IPFS gateways failed for ${uri}; tried: ${attempted.join(", ")}`,
        { retryable: true },
      ),
    );
  };

  return fetchWithCache(uri, "ipfs", doFetch, (raw) => verifyCid(parsed.cid, raw), opts);
}

async function handleHttps(uri: string, opts: FetchOptions): Promise<Result<FetchedFile>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return fetchWithCache(
    uri,
    "https",
    () => fetchBytes(uri, fetchImpl),
    // No on-chain hash commitment exists for https:// registration files in v1
    // (WP-2 audit amendment 1) — always unverifiable, never true/false.
    () => Promise.resolve(null),
    opts,
  );
}

export async function fetchRegistrationFile(
  uri: string,
  opts: FetchOptions = {},
): Promise<Result<FetchedFile>> {
  const now = opts.now ?? (() => new Date());

  if (uri.startsWith("data:")) {
    return handleData(uri, now);
  }
  if (uri.startsWith("ipfs://")) {
    return handleIpfs(uri, opts);
  }
  if (uri.startsWith("https://")) {
    return handleHttps(uri, opts);
  }

  const scheme = uri.split(":")[0] ?? uri;
  return err(bridgeError("FILE_UNREACHABLE", `unsupported URI scheme: ${scheme}`));
}

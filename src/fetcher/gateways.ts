// Default public IPFS HTTP gateways, tried in order (see WP-3 spec R-2). Overridable
// via the comma-separated IPFS_GATEWAYS env var.
const DEFAULT_GATEWAYS = [
  "https://ipfs.io",
  "https://cloudflare-ipfs.com",
  "https://gateway.pinata.cloud",
];

export function resolveGateways(override?: string[]): string[] {
  if (override && override.length > 0) {
    return override;
  }
  const raw = process.env["IPFS_GATEWAYS"];
  if (raw !== undefined && raw.trim().length > 0) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return DEFAULT_GATEWAYS;
}

export type ParsedIpfsUri = { cid: string; path: string };

// Parses `ipfs://<cid>[/path...]`. The CID is the first path segment; anything after
// the first `/` is passed through unchanged to the gateway.
export function parseIpfsUri(uri: string): ParsedIpfsUri | null {
  const match = /^ipfs:\/\/([^/]+)(\/.*)?$/.exec(uri);
  if (!match) {
    return null;
  }
  const cid = match[1];
  if (!cid) {
    return null;
  }
  return { cid, path: match[2] ?? "" };
}

export function gatewayUrl(gateway: string, parsed: ParsedIpfsUri): string {
  const base = gateway.replace(/\/+$/, "");
  return `${base}/ipfs/${parsed.cid}${parsed.path}`;
}

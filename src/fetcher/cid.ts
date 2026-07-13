import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { logger } from "../shared/logger.js";

// multihash function code for sha2-256 (see multiformats/multicodec table).
const SHA2_256_CODE = 0x12;

/**
 * Verifies fetched bytes against an IPFS CID (the on-chain commitment for ipfs://
 * registration files — see WP-2 audit amendment 1).
 *
 * Coverage (documented per WP-3 spec R-2's "disproportionate effort" carve-out):
 * - CIDv0 (always dag-pb + sha2-256) and CIDv1 (any codec) with a sha2-256 multihash
 *   are checked by hashing the raw fetched bytes directly and comparing against the
 *   multihash digest. This is an exact, correct check for CIDv1 raw-codec (0x55)
 *   content. For dag-pb-codec content (0x70 — the default for both CIDv0 and
 *   `ipfs add` without --raw-leaves) it is only exact for single-block UnixFS files
 *   whose node bytes equal the raw content bytes; real multi-block or otherwise
 *   protobuf-wrapped UnixFS files would hash differently and could be misreported as
 *   verified:false even when authentic. Full UnixFS/dag-pb decoding is out of scope
 *   for this WP (see completion report "known gaps").
 * - Any other multihash algorithm (not sha2-256) is treated as unverifiable
 *   (`verified: null`) with a logged warning, rather than guessed at.
 * - A CID string that fails to parse is likewise treated as unverifiable.
 */
export async function verifyCid(cidStr: string, bytes: Uint8Array): Promise<boolean | null> {
  let cid: CID;
  try {
    cid = CID.parse(cidStr);
  } catch (cause) {
    logger.warn("failed to parse IPFS CID; treating as unverifiable", {
      cid: cidStr,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }

  if (cid.multihash.code !== SHA2_256_CODE) {
    logger.warn("unsupported multihash algorithm for CID verification; treating as unverifiable", {
      cid: cidStr,
      multihashCode: cid.multihash.code,
    });
    return null;
  }

  const digest = await sha256.digest(bytes);
  const expected = cid.multihash.digest;
  const actual = digest.digest;
  if (actual.length !== expected.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

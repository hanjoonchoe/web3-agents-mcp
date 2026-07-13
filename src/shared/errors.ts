export type ErrorCode =
  | "AGENT_NOT_FOUND"
  | "CHAIN_UNSUPPORTED"
  | "RPC_ERROR"
  | "FILE_UNREACHABLE"
  | "FILE_HASH_MISMATCH"
  | "INDEX_UNAVAILABLE"
  | "INVALID_INPUT";

export type BridgeError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
};

const DEFAULT_RETRYABLE: Record<ErrorCode, boolean> = {
  AGENT_NOT_FOUND: false,
  CHAIN_UNSUPPORTED: false,
  RPC_ERROR: true,
  FILE_UNREACHABLE: true,
  FILE_HASH_MISMATCH: false,
  INDEX_UNAVAILABLE: false,
  INVALID_INPUT: false,
};

export function bridgeError(
  code: ErrorCode,
  message: string,
  opts?: { retryable?: boolean; cause?: unknown },
): BridgeError {
  return {
    code,
    message,
    retryable: opts?.retryable ?? DEFAULT_RETRYABLE[code],
    cause: opts?.cause,
  };
}

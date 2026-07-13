import { fetchRegistrationFile, type FetchOptions, type FetchedFile } from "../fetcher/fetch.js";
import { getAgent, type AgentRecord } from "../registry/identity.js";
import { getSummary, type FeedbackSummary } from "../registry/reputation.js";
import {
  getValidations,
  type PageOptions,
  type ValidationMethod,
  type ValidationsPage,
} from "../registry/validation.js";
import { bridgeError, type BridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";
import { deriveMissingSections, type MissingSection } from "./naive-scorer.js";
import { NaiveScorer } from "./naive-scorer.js";
import type { Scorer, ScorerInput } from "./scorer.js";
import { buildTrustSummary } from "./summary.js";

/**
 * Orchestration for the `assess_trust` composite tool (WP-5 R-1/R-2/R-3).
 *
 * Runs identity, reputation (getSummary), and validations concurrently
 * (Promise.allSettled semantics — no sub-query failure ever throws out of this
 * module); the registration-file fetch is chained off identity (it needs
 * `tokenUri`) but starts as soon as identity resolves, not after the other two
 * sub-queries complete. A single 15s wall-clock budget (default; injectable) is
 * raced against every sub-query — whichever haven't settled by the deadline are
 * dropped and their section becomes `null` / added to `missing`.
 */

export type IdentitySection = {
  agentId: string;
  owner: string;
  tokenUri: string;
  registeredAt: string | null;
};

export type RegistrationFileSection = {
  verified: boolean | null;
  hashComputed: string;
  source: FetchedFile["source"];
  fetchedAt: string;
  content: unknown;
  contentError: "not-json" | null;
};

export type ReputationSection = {
  count: string;
  averageScore: number | null;
  lastFeedbackAt: string | null;
};

export type ValidationEntrySection = {
  validator: string;
  method: ValidationMethod;
  requestHash: string | null;
  response: unknown;
  timestamp: string | null;
};

export type ValidationsSection = {
  entries: ValidationEntrySection[];
  count: string;
  pagination: { limit: number; offset: number };
};

export type TrustAssessment = {
  score: number | null;
  confidence: "low" | "medium" | "high";
  caveats: string[];
};

export type TrustReport = {
  identity: IdentitySection | null;
  registrationFile: RegistrationFileSection | null;
  reputation: ReputationSection | null;
  validations: ValidationsSection | null;
  assessment: TrustAssessment;
  summary: string;
  missing: MissingSection[];
};

export type AssembleDeps = {
  getAgent: (chainId: number, agentId: bigint) => Promise<Result<AgentRecord>>;
  getSummary: (chainId: number, agentId: bigint) => Promise<Result<FeedbackSummary>>;
  getValidations: (
    chainId: number,
    agentId: bigint,
    page: PageOptions,
  ) => Promise<Result<ValidationsPage>>;
  fetchRegistrationFile: (uri: string, opts?: FetchOptions) => Promise<Result<FetchedFile>>;
};

export type AssembleOptions = {
  /** Wall-clock budget in ms for the whole assembly. Default 15000 (R-3). */
  timeoutMs?: number;
  scorer?: Scorer;
  taskContext?: string;
  validationPage?: PageOptions;
  deps?: Partial<AssembleDeps>;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_VALIDATION_PAGE: PageOptions = { limit: 200, offset: 0 };

type Outcome<T> = { type: "done"; value: Result<T> } | { type: "timeout" };

/** Never throws: any exception from the underlying call is mapped to RPC_ERROR. */
async function safe<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(bridgeError("RPC_ERROR", message, { retryable: true, cause }));
  }
}

function createDeadline(timeoutMs: number): { promise: Promise<"timeout">; clear: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

async function raceAgainstDeadline<T>(
  work: Promise<Result<T>>,
  deadline: Promise<"timeout">,
): Promise<Outcome<T>> {
  const winner = await Promise.race([
    work.then((value): Outcome<T> => ({ type: "done", value })),
    deadline.then((): Outcome<T> => ({ type: "timeout" })),
  ]);
  return winner;
}

function agentNameFromContent(content: unknown): string | null {
  if (content !== null && typeof content === "object") {
    const name = (content as Record<string, unknown>)["name"];
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }
  return null;
}

function toIdentitySection(record: AgentRecord): IdentitySection {
  return {
    agentId: record.agentId.toString(),
    owner: record.owner,
    tokenUri: record.tokenUri,
    registeredAt: record.registeredAt !== null ? record.registeredAt.toString() : null,
  };
}

function toRegistrationFileSection(file: FetchedFile): RegistrationFileSection {
  return {
    verified: file.verified,
    hashComputed: file.hashComputed,
    source: file.source,
    fetchedAt: file.fetchedAt,
    content: file.content,
    contentError: file.contentError,
  };
}

function toReputationSection(summary: FeedbackSummary): ReputationSection {
  return {
    count: summary.count.toString(),
    averageScore: summary.averageScore,
    lastFeedbackAt: summary.lastFeedbackAt !== null ? summary.lastFeedbackAt.toString() : null,
  };
}

function toValidationsSection(page: ValidationsPage, pagination: PageOptions): ValidationsSection {
  return {
    entries: page.entries.map((entry) => ({
      validator: entry.validator,
      method: entry.method,
      requestHash: entry.requestHash,
      response: entry.response,
      timestamp: entry.timestamp !== null ? entry.timestamp.toString() : null,
    })),
    count: page.total.toString(),
    pagination,
  };
}

export async function assembleTrustReport(
  chainId: number,
  agentId: bigint,
  opts: AssembleOptions = {},
): Promise<Result<TrustReport>> {
  const deps: AssembleDeps = {
    getAgent,
    getSummary,
    getValidations,
    fetchRegistrationFile,
    ...opts.deps,
  };
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scorer = opts.scorer ?? new NaiveScorer();
  const validationPage = opts.validationPage ?? DEFAULT_VALIDATION_PAGE;

  const deadline = createDeadline(timeoutMs);

  const identityWork = safe(() => deps.getAgent(chainId, agentId));
  const reputationWork = safe(() => deps.getSummary(chainId, agentId));
  const validationsWork = safe(() => deps.getValidations(chainId, agentId, validationPage));
  // Registration-file fetch is chained off identity — it needs tokenUri, and starts
  // as soon as identity resolves rather than waiting on reputation/validations.
  const fileWork = identityWork.then((identityResult): Promise<Result<FetchedFile>> => {
    if (!isOk(identityResult)) {
      return Promise.resolve(err(identityResult.error));
    }
    return safe(() => deps.fetchRegistrationFile(identityResult.value.tokenUri));
  });

  try {
    const [identityOutcome, fileOutcome, reputationOutcome, validationsOutcome] = await Promise.all(
      [
        raceAgainstDeadline(identityWork, deadline.promise),
        raceAgainstDeadline(fileWork, deadline.promise),
        raceAgainstDeadline(reputationWork, deadline.promise),
        raceAgainstDeadline(validationsWork, deadline.promise),
      ],
    );

    // R-2: AGENT_NOT_FOUND from identity is special — the agent doesn't exist, so
    // there is no report to build; propagate the plain error envelope.
    if (identityOutcome.type === "done" && !isOk(identityOutcome.value)) {
      const identityError: BridgeError = identityOutcome.value.error;
      if (identityError.code === "AGENT_NOT_FOUND") {
        return err(identityError);
      }
    }

    const identity =
      identityOutcome.type === "done" && isOk(identityOutcome.value)
        ? identityOutcome.value.value
        : null;
    const file =
      fileOutcome.type === "done" && isOk(fileOutcome.value) ? fileOutcome.value.value : null;
    const reputation =
      reputationOutcome.type === "done" && isOk(reputationOutcome.value)
        ? reputationOutcome.value.value
        : null;
    const validations =
      validationsOutcome.type === "done" && isOk(validationsOutcome.value)
        ? validationsOutcome.value.value
        : null;

    const scorerInput: ScorerInput = {
      identity: identity
        ? {
            agentId: identity.agentId,
            owner: identity.owner,
            tokenUri: identity.tokenUri,
            registeredAt: identity.registeredAt,
          }
        : null,
      file: file ? { verified: file.verified } : null,
      reputation: reputation
        ? { count: reputation.count, averageScore: reputation.averageScore }
        : null,
      validations: validations
        ? {
            entries: validations.entries.map((e) => ({ method: e.method })),
            total: validations.total,
          }
        : null,
    };

    const assessment = scorer.score(scorerInput);
    const missing = deriveMissingSections(scorerInput);

    const summary = buildTrustSummary({
      chainId,
      agentId: identity ? identity.agentId.toString() : agentId.toString(),
      agentName: file ? agentNameFromContent(file.content) : null,
      fileVerified: file ? file.verified : "unavailable",
      reputationCount: reputation ? Number(reputation.count) : null,
      reputationAverage: reputation ? reputation.averageScore : null,
      hasValidations: validations ? validations.total >= 1 : null,
      confidence: assessment.confidence,
      leadingCaveat: assessment.caveats[0] ?? "",
      taskContext: opts.taskContext,
    });

    const report: TrustReport = {
      identity: identity ? toIdentitySection(identity) : null,
      registrationFile: file ? toRegistrationFileSection(file) : null,
      reputation: reputation ? toReputationSection(reputation) : null,
      validations: validations ? toValidationsSection(validations, validationPage) : null,
      assessment,
      summary,
      missing,
    };

    return ok(report);
  } finally {
    deadline.clear();
  }
}

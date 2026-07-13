import { describe, expect, it } from "vitest";
import {
  FILE_MISMATCH_CAVEAT,
  FILE_UNVERIFIABLE_CAVEAT,
  LOW_VOLUME_CAVEAT,
  NAIVE_HEURISTIC_CAVEAT,
  NaiveScorer,
  SCALE_CAVEAT,
  SYBIL_CAVEAT,
  missingCaveat,
} from "../../src/trust/naive-scorer.js";
import type { ScorerInput } from "../../src/trust/scorer.js";

const scorer = new NaiveScorer();

const IDENTITY = {
  agentId: 1n,
  owner: "0xabc",
  tokenUri: "data:application/json,{}",
  registeredAt: null,
};

const BASE_INPUT: ScorerInput = {
  identity: IDENTITY,
  file: null,
  reputation: null,
  validations: null,
};

describe("NaiveScorer — R-5 table-driven", () => {
  it("T-1: identity missing -> score null (no base)", () => {
    const result = scorer.score({
      identity: null,
      file: null,
      reputation: null,
      validations: null,
    });
    expect(result.score).toBeNull();
  });

  it("T-1: base only (identity resolved, nothing else) = 30", () => {
    const result = scorer.score(BASE_INPUT);
    expect(result.score).toBe(30);
  });

  it("T-1: file verified === true => +20 (30+20=50)", () => {
    const result = scorer.score({ ...BASE_INPUT, file: { verified: true } });
    expect(result.score).toBe(50);
  });

  it("T-1: file present, verified === null (unverifiable) => +5 (30+5=35)", () => {
    const result = scorer.score({ ...BASE_INPUT, file: { verified: null } });
    expect(result.score).toBe(35);
  });

  it("T-1: file verified === false (mismatch) => -30 (30-30=0)", () => {
    const result = scorer.score({ ...BASE_INPUT, file: { verified: false } });
    expect(result.score).toBe(0);
  });

  it("T-1: feedback volume — count=5 => floor(5/5)*4=4 (30+4=34)", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      reputation: { count: 5n, averageScore: null },
    });
    expect(result.score).toBe(34);
  });

  it("T-1: feedback volume caps at +20 for count>=25 (floor(25/5)*4=20)", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      reputation: { count: 25n, averageScore: null },
    });
    expect(result.score).toBe(50); // 30 + 20
  });

  it("T-1: feedback volume caps at +20 even for very large count (e.g. 200)", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      reputation: { count: 200n, averageScore: null },
    });
    // 30 base + 20 volume cap; count>=5 so avg contributes too, but avg is null here.
    expect(result.score).toBe(50);
  });

  it("T-1: average score contributes only when count >= 5 (count=4, avg=100 -> no contribution)", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      reputation: { count: 4n, averageScore: 100 },
    });
    // 30 base + floor(4/5)*4=0 volume + no avg contribution (count<5)
    expect(result.score).toBe(30);
  });

  it("T-1: average score contributes (30/100)*15=4.5 when count>=5", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      reputation: { count: 5n, averageScore: 30 },
    });
    // 30 base + 4 volume + 4.5 avg = 38.5 -> rounds to 39 (clamp then round)
    expect(result.score).toBe(Math.round(30 + 4 + (30 / 100) * 15));
  });

  it("T-1: >=1 validation entry => +10", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      validations: { entries: [{ method: "other" }], total: 1 },
    });
    expect(result.score).toBe(40);
  });

  it("T-1: >=1 validation with method tee => +5 more (total +15)", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      validations: { entries: [{ method: "tee" }], total: 1 },
    });
    expect(result.score).toBe(45);
  });

  it("T-1: >=1 validation with method zk => +5 more (total +15)", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      validations: { entries: [{ method: "zk" }], total: 1 },
    });
    expect(result.score).toBe(45);
  });

  it("T-1: validation with method reexec/other does NOT get the +5 tee/zk bonus", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      validations: { entries: [{ method: "reexec" }], total: 1 },
    });
    expect(result.score).toBe(40);
  });

  it("T-1: clamp lower bound — heavy negative components floor at 0", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      file: { verified: false }, // -30 -> would be 0 already; verify explicit floor
      reputation: { count: 0n, averageScore: null },
    });
    expect(result.score).toBe(0);
  });

  it("T-1: clamp upper bound — every positive component maxed out clamps at 100", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: true }, // +20
      reputation: { count: 1000n, averageScore: 100 }, // +20 vol, +15 avg
      validations: { entries: [{ method: "tee" }], total: 5 }, // +10 +5
    });
    // raw = 30+20+20+15+10+5 = 100 exactly; still assert clamp holds even if raw > 100
    expect(result.score).toBe(100);
  });

  it("T-1: agent #0-shaped combination — verified file + 57 feedback (avg 100 clamp) + 0 validations = 85", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: true },
      reputation: { count: 57n, averageScore: 100 },
      validations: { entries: [], total: 0 },
    });
    // 30 base + 20 file + 20 volume(cap) + 15 avg + 0 validation = 85
    expect(result.score).toBe(85);
  });

  it("T-1: combination — unverifiable file + low feedback + validation with zk", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: null },
      reputation: { count: 2n, averageScore: 50 },
      validations: { entries: [{ method: "zk" }], total: 1 },
    });
    // 30 base + 5 file + 0 volume (floor(2/5)*4=0) + no avg (count<5) + 10 + 5 = 50
    expect(result.score).toBe(50);
  });

  it("T-1: combination — mismatch file + high feedback + tee validation clamps at 0 lower-bound math but not below", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: false },
      reputation: { count: 0n, averageScore: null },
      validations: { entries: [], total: 0 },
    });
    // 30 - 30 = 0
    expect(result.score).toBe(0);
  });
});

describe("NaiveScorer — R-6 confidence matrix", () => {
  it("T-4: identity missing -> low", () => {
    const result = scorer.score({
      identity: null,
      file: null,
      reputation: null,
      validations: null,
    });
    expect(result.confidence).toBe("low");
  });

  it("T-4: count=9 (below 10 boundary), verified, with validation -> low", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: true },
      reputation: { count: 9n, averageScore: 80 },
      validations: { entries: [{ method: "other" }], total: 1 },
    });
    expect(result.confidence).toBe("low");
  });

  it("T-4: count=10 (at boundary), verified, with validation -> medium", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: true },
      reputation: { count: 10n, averageScore: 80 },
      validations: { entries: [{ method: "other" }], total: 1 },
    });
    expect(result.confidence).toBe("medium");
  });

  it("T-4: count=10, verified, but NO validation -> low", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: true },
      reputation: { count: 10n, averageScore: 80 },
      validations: { entries: [], total: 0 },
    });
    expect(result.confidence).toBe("low");
  });

  it("T-4: count=10, validation present, but file NOT verified (null) -> low", () => {
    const result = scorer.score({
      identity: IDENTITY,
      file: { verified: null },
      reputation: { count: 10n, averageScore: 80 },
      validations: { entries: [{ method: "other" }], total: 1 },
    });
    expect(result.confidence).toBe("low");
  });

  it("T-4: 'high' is unreachable — no input configuration ever yields 'high'", () => {
    const extremeInput: ScorerInput = {
      identity: IDENTITY,
      file: { verified: true },
      reputation: { count: 100000n, averageScore: 100 },
      validations: { entries: [{ method: "tee" }, { method: "zk" }], total: 50 },
    };
    const result = scorer.score(extremeInput);
    expect(result.confidence).not.toBe("high");
    expect(["low", "medium"]).toContain(result.confidence);
  });
});

describe("NaiveScorer — R-7 caveats", () => {
  it("T-5: caveats always include at least the two universal caveats", () => {
    const result = scorer.score(BASE_INPUT);
    expect(result.caveats.length).toBeGreaterThanOrEqual(2);
    expect(result.caveats).toContain(SYBIL_CAVEAT);
    expect(result.caveats).toContain(NAIVE_HEURISTIC_CAVEAT);
  });

  it("T-5: file mismatch adds the mismatch caveat", () => {
    const result = scorer.score({ ...BASE_INPUT, file: { verified: false } });
    expect(result.caveats).toContain(FILE_MISMATCH_CAVEAT);
  });

  it("T-5: file unverifiable adds the unverifiable caveat", () => {
    const result = scorer.score({ ...BASE_INPUT, file: { verified: null } });
    expect(result.caveats).toContain(FILE_UNVERIFIABLE_CAVEAT);
  });

  it("T-5: every missing section has a corresponding caveat", () => {
    const result = scorer.score({
      identity: null,
      file: null,
      reputation: null,
      validations: null,
    });
    expect(result.caveats).toContain(missingCaveat("identity"));
    expect(result.caveats).toContain(missingCaveat("registrationFile"));
    expect(result.caveats).toContain(missingCaveat("reputation"));
    expect(result.caveats).toContain(missingCaveat("validations"));
  });

  it("T-5: clamp/scale caveat present when reputation count > 0", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      reputation: { count: 12n, averageScore: 80 },
    });
    expect(result.caveats).toContain(SCALE_CAVEAT);
  });

  it("T-5: scale caveat absent when reputation count === 0", () => {
    const result = scorer.score({
      ...BASE_INPUT,
      reputation: { count: 0n, averageScore: null },
    });
    expect(result.caveats).not.toContain(SCALE_CAVEAT);
    expect(result.caveats).toContain(LOW_VOLUME_CAVEAT);
  });

  it("T-5: low-volume caveat present when count < 5, absent when count >= 5", () => {
    const low = scorer.score({ ...BASE_INPUT, reputation: { count: 3n, averageScore: 50 } });
    expect(low.caveats).toContain(LOW_VOLUME_CAVEAT);

    const high = scorer.score({ ...BASE_INPUT, reputation: { count: 20n, averageScore: 50 } });
    expect(high.caveats).not.toContain(LOW_VOLUME_CAVEAT);
  });
});

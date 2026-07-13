import { describe, expect, it } from "vitest";
import {
  FILE_MISMATCH_CAVEAT,
  FILE_UNVERIFIABLE_CAVEAT,
  LOW_VOLUME_CAVEAT,
  SCALE_CAVEAT,
  SYBIL_CAVEAT,
  buildCaveats,
  deriveMissingSections,
  missingCaveat,
  type TrustSections,
} from "../../src/trust/caveats.js";

const IDENTITY = {
  agentId: 1n,
  owner: "0xabc",
  tokenUri: "data:application/json,{}",
  registeredAt: null,
};

const BASE_SECTIONS: TrustSections = {
  identity: IDENTITY,
  file: null,
  reputation: null,
  validations: null,
};

function caveatsFor(sections: TrustSections): string[] {
  return buildCaveats(sections, deriveMissingSections(sections));
}

describe("buildCaveats", () => {
  it("T-5: caveats are always non-empty and always include the Sybil caveat", () => {
    const complete: TrustSections = {
      identity: IDENTITY,
      file: { verified: true },
      reputation: { count: 57n, averageScore: 100 },
      validations: { total: 0 },
    };
    const caveats = caveatsFor(complete);
    expect(caveats.length).toBeGreaterThanOrEqual(1);
    expect(caveats).toContain(SYBIL_CAVEAT);
  });

  it("T-5: file mismatch adds the mismatch caveat", () => {
    const caveats = caveatsFor({ ...BASE_SECTIONS, file: { verified: false } });
    expect(caveats).toContain(FILE_MISMATCH_CAVEAT);
  });

  it("T-5: file unverifiable adds the unverifiable caveat", () => {
    const caveats = caveatsFor({ ...BASE_SECTIONS, file: { verified: null } });
    expect(caveats).toContain(FILE_UNVERIFIABLE_CAVEAT);
  });

  it("T-5: every missing section has a corresponding caveat", () => {
    const caveats = caveatsFor({
      identity: null,
      file: null,
      reputation: null,
      validations: null,
    });
    expect(caveats).toContain(missingCaveat("identity"));
    expect(caveats).toContain(missingCaveat("registrationFile"));
    expect(caveats).toContain(missingCaveat("reputation"));
    expect(caveats).toContain(missingCaveat("validations"));
  });

  it("T-5: scale/clamp caveat present when reputation count > 0", () => {
    const caveats = caveatsFor({
      ...BASE_SECTIONS,
      reputation: { count: 12n, averageScore: 80 },
    });
    expect(caveats).toContain(SCALE_CAVEAT);
  });

  it("T-5: scale caveat absent when reputation count === 0; low-volume caveat present", () => {
    const caveats = caveatsFor({
      ...BASE_SECTIONS,
      reputation: { count: 0n, averageScore: null },
    });
    expect(caveats).not.toContain(SCALE_CAVEAT);
    expect(caveats).toContain(LOW_VOLUME_CAVEAT);
  });

  it("T-5: low-volume caveat present when count < 5, absent when count >= 5", () => {
    const low = caveatsFor({ ...BASE_SECTIONS, reputation: { count: 3n, averageScore: 50 } });
    expect(low).toContain(LOW_VOLUME_CAVEAT);

    const high = caveatsFor({ ...BASE_SECTIONS, reputation: { count: 20n, averageScore: 50 } });
    expect(high).not.toContain(LOW_VOLUME_CAVEAT);
  });

  it("no score/confidence language leaks into any caveat", () => {
    const caveats = caveatsFor({
      identity: null,
      file: { verified: false },
      reputation: { count: 2n, averageScore: 50 },
      validations: null,
    });
    for (const caveat of caveats) {
      expect(caveat).not.toMatch(/NaiveScorer|confidence/i);
    }
  });
});

describe("deriveMissingSections", () => {
  it("maps each null section to its name, in stable order", () => {
    expect(
      deriveMissingSections({ identity: null, file: null, reputation: null, validations: null }),
    ).toEqual(["identity", "registrationFile", "reputation", "validations"]);
    expect(
      deriveMissingSections({
        identity: IDENTITY,
        file: { verified: true },
        reputation: { count: 1n, averageScore: 50 },
        validations: { total: 0 },
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { supportedSlugs } from "../../src/chains/config.js";
import { resolveAgentInputShape } from "../../src/tools/resolve-agent.js";
import { assessTrustInputShape } from "../../src/tools/assess-trust.js";

/**
 * WP-6.5 second amendment: the shared `chain` input schema must be a zod enum built
 * dynamically from `src/chains/config.ts` — asserted here against two independent
 * tools' input shapes so a config change (e.g. adding a chain) is guaranteed to widen
 * every tool's schema without any other code change.
 */
function enumOptionsOf(schema: unknown): string[] {
  const optional = schema as { unwrap?: () => unknown };
  const inner = typeof optional.unwrap === "function" ? optional.unwrap() : schema;
  const withOptions = inner as { options?: string[]; _def?: { values?: string[] } };
  return withOptions.options ?? withOptions._def?.values ?? [];
}

describe("shared chain input schema", () => {
  it("resolve_agent's `chain` field enum is exactly the configured slugs", () => {
    const options = enumOptionsOf(resolveAgentInputShape.chain);
    expect(options.slice().sort()).toEqual(supportedSlugs().slice().sort());
  });

  it("assess_trust's `chain` field enum is exactly the configured slugs", () => {
    const options = enumOptionsOf(assessTrustInputShape.chain);
    expect(options.slice().sort()).toEqual(supportedSlugs().slice().sort());
  });

  it("the configured slug enum includes all 5 newly added chains", () => {
    const options = enumOptionsOf(resolveAgentInputShape.chain);
    for (const slug of ["polygon", "arbitrum", "optimism", "bnb", "gnosis"]) {
      expect(options).toContain(slug);
    }
  });
});

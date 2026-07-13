import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
// Imports the *built* output (dist/), not src/, because this script runs directly
// under `node` (no TS-to-JS loader is configured) — `pnpm docs:gen` runs `pnpm
// build` first for exactly this reason.
import { TOOL_METADATA, type ToolMetadata } from "../dist/server/register-tools.js";
import type { ErrorCode } from "../dist/shared/errors.js";

/**
 * Generates `docs/tools.md` from each tool's exported description + zod
 * input/output schemas (see `TOOL_METADATA` in src/server/register-tools.ts, the
 * single source of truth also used to register the tools). Run via `pnpm docs:gen`;
 * CI re-runs it and diffs the result to catch drift (WP-6 B-2).
 *
 * Error codes a tool can return are not derivable from the zod schemas (they come
 * from runtime control flow), so they are hand-maintained here per WP-6 spec B-2.
 */

const ERROR_CODES: Record<string, ErrorCode[]> = {
  ping: [],
  resolve_agent: ["INVALID_INPUT", "CHAIN_UNSUPPORTED", "AGENT_NOT_FOUND", "RPC_ERROR"],
  get_registration_file: [
    "INVALID_INPUT",
    "CHAIN_UNSUPPORTED",
    "AGENT_NOT_FOUND",
    "RPC_ERROR",
    "FILE_UNREACHABLE",
    "FILE_HASH_MISMATCH",
  ],
  get_reputation: ["INVALID_INPUT", "CHAIN_UNSUPPORTED", "AGENT_NOT_FOUND", "RPC_ERROR"],
  get_validations: ["INVALID_INPUT", "CHAIN_UNSUPPORTED", "AGENT_NOT_FOUND", "RPC_ERROR"],
  assess_trust: ["INVALID_INPUT", "CHAIN_UNSUPPORTED", "AGENT_NOT_FOUND", "RPC_ERROR"],
  search_agents: ["INVALID_INPUT", "INDEX_UNAVAILABLE"],
};

type FieldRow = { field: string; type: string; required: boolean; default: string };

function describeType(schema: z.ZodTypeAny, depth = 0): string {
  const def = schema._def as { typeName: string };
  switch (def.typeName) {
    case "ZodOptional":
      return describeType((schema as z.ZodOptional<z.ZodTypeAny>).unwrap(), depth);
    case "ZodDefault":
      return describeType(
        (schema as z.ZodDefault<z.ZodTypeAny>)._def.innerType as z.ZodTypeAny,
        depth,
      );
    case "ZodNullable":
      return `${describeType((schema as z.ZodNullable<z.ZodTypeAny>).unwrap(), depth)} | null`;
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodUnknown":
    case "ZodAny":
      return "unknown";
    case "ZodLiteral":
      return JSON.stringify((schema as z.ZodLiteral<unknown>).value);
    case "ZodEnum":
      return (schema as z.ZodEnum<[string, ...string[]]>).options.map((o) => `"${o}"`).join(" | ");
    case "ZodArray":
      return `${describeType((schema as z.ZodArray<z.ZodTypeAny>).element, depth)}[]`;
    case "ZodUnion":
      return (schema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>)._def.options
        .map((o: z.ZodTypeAny) => describeType(o, depth))
        .join(" | ");
    case "ZodObject": {
      if (depth >= 1) {
        return "object";
      }
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const fields = Object.entries(shape)
        .map(([key, value]) => `${key}: ${describeType(value as z.ZodTypeAny, depth + 1)}`)
        .join("; ");
      return `{ ${fields} }`;
    }
    default:
      return def.typeName.replace(/^Zod/, "").toLowerCase();
  }
}

function isOptionalField(schema: z.ZodTypeAny): boolean {
  return schema.isOptional();
}

function defaultValueOf(schema: z.ZodTypeAny): string {
  const def = schema._def as { typeName: string; defaultValue?: () => unknown };
  if (def.typeName === "ZodDefault" && def.defaultValue) {
    return JSON.stringify(def.defaultValue());
  }
  if (def.typeName === "ZodOptional") {
    return defaultValueOf((schema as z.ZodOptional<z.ZodTypeAny>).unwrap());
  }
  return "—";
}

function inputRows(shape: Record<string, z.ZodTypeAny> | undefined): FieldRow[] {
  if (!shape) {
    return [];
  }
  return Object.entries(shape).map(([field, schema]) => ({
    field,
    type: describeType(schema),
    required: !isOptionalField(schema),
    default: defaultValueOf(schema),
  }));
}

function inputTable(rows: FieldRow[]): string {
  if (rows.length === 0) {
    return "_No input fields._\n";
  }
  const header = "| Field | Type | Required | Default |\n| --- | --- | --- | --- |";
  const body = rows
    .map((r) => `| \`${r.field}\` | \`${r.type}\` | ${r.required ? "yes" : "no"} | ${r.default} |`)
    .join("\n");
  return `${header}\n${body}\n`;
}

function outputSketch(schema: z.ZodTypeAny): string {
  return `\`\`\`\n${describeType(schema)}\n\`\`\`\n`;
}

function errorCodesList(name: string): string {
  const codes = ERROR_CODES[name] ?? [];
  if (codes.length === 0) {
    return "_Never returns an error envelope._\n";
  }
  return codes.map((c) => `- \`${c}\``).join("\n") + "\n";
}

function renderTool(meta: ToolMetadata): string {
  const rows = inputRows(meta.inputShape);
  return [
    `## \`${meta.name}\``,
    "",
    meta.description,
    "",
    "**Input**",
    "",
    inputTable(rows),
    "**Output (sketch)**",
    "",
    outputSketch(meta.outputSchema),
    "**Possible error codes**",
    "",
    errorCodesList(meta.name),
  ].join("\n");
}

function render(): string {
  const header = [
    "<!-- GENERATED FILE — do not edit by hand. Run `pnpm docs:gen` to regenerate. -->",
    "# Tool reference",
    "",
    "Generated from each tool's zod input/output schemas and description " +
      "(`src/server/register-tools.ts`) by `scripts/gen-tool-docs.ts`.",
    "",
  ].join("\n");
  const body = TOOL_METADATA.map(renderTool).join("\n");
  return `${header}\n${body}`;
}

function main(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(here, "..", "docs", "tools.md");
  writeFileSync(outPath, render());
  process.stderr.write(`wrote ${outPath}\n`);
}

main();

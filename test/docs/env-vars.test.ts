import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * T-ENV (WP-6 B-6): every environment variable referenced in `src/` must appear in
 * the README's Configuration table, and vice versa — so the docs can never silently
 * drift from the actual env-var surface.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..", "..");
const srcDir = path.join(repoRoot, "src");
const readmePath = path.join(repoRoot, "README.md");

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Extracts env var names referenced via `process.env["NAME"]`, `process.env['NAME']`,
 * or a template literal `` process.env[`NAME_${expr}`] `` — the latter is normalized
 * to `NAME_<expr>` to match the README's placeholder convention.
 */
function extractEnvVarsFromSrc(): Set<string> {
  const names = new Set<string>();
  for (const file of listTsFiles(srcDir)) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/process\.env\[["']([^"']+)["']\]/g)) {
      names.add(match[1] as string);
    }
    for (const match of content.matchAll(/process\.env\[`([^`]+)`\]/g)) {
      const raw = match[1] as string;
      const normalized = raw.replace(/\$\{[^}]+\}/g, (placeholder) => {
        const inner = placeholder.slice(2, -1).trim();
        // Best-effort: turn `${chainId}` into `<chainId>`.
        const simpleName = inner.split(/[.[]/)[0];
        return `<${simpleName}>`;
      });
      names.add(normalized);
    }
  }
  return names;
}

/** Extracts the first-column env var name from each row of the README's Configuration table. */
function extractEnvVarsFromReadme(): Set<string> {
  const content = readFileSync(readmePath, "utf8");
  const configSectionMatch = /## Configuration\n([\s\S]*?)\n## /.exec(content);
  if (!configSectionMatch) {
    throw new Error("README.md has no ## Configuration section");
  }
  const section = configSectionMatch[1] as string;
  const names = new Set<string>();
  for (const line of section.split("\n")) {
    const cellMatch = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (cellMatch) {
      names.add(cellMatch[1] as string);
    }
  }
  return names;
}

describe("README Configuration table matches src/ env var usage", () => {
  it("every env var referenced in src/ appears in the README table, and vice versa", () => {
    const fromSrc = extractEnvVarsFromSrc();
    const fromReadme = extractEnvVarsFromReadme();

    expect(fromSrc.size).toBeGreaterThan(0);
    expect(fromReadme.size).toBeGreaterThan(0);

    const missingFromReadme = [...fromSrc].filter((name) => !fromReadme.has(name));
    const missingFromSrc = [...fromReadme].filter((name) => !fromSrc.has(name));

    expect(missingFromReadme, "env vars used in src/ but undocumented in README").toEqual([]);
    expect(missingFromSrc, "env vars documented in README but unused in src/").toEqual([]);
  });
});

#!/usr/bin/env node
/**
 * Contract lint (build gate). Two enforceable rules from the contract:
 *   1. No hardcoded tenant role WORDS in app source — they must resolve from
 *      company.role_labels via RoleLabel/resolveLabels.
 *   2. "AI" / internal layer or model names never appear on a user-facing surface.
 *
 * Scans apps/web/src. A line containing `contract-lint-ignore` is skipped (use
 * sparingly, with a reason). Exits non-zero on any hit so the build fails.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "../src");

const RULES = [
  // tenant role display words that must come from config, never literals
  { category: "role-word", re: /\bTeam Member\b/, hint: "use RoleLabel role=\"subject\"" },
  { category: "role-word", re: /\bPeople Ops\b/, hint: "use RoleLabel role=\"admin\"" },
  { category: "role-word", re: /\bReviewee\b/, hint: "resolve from company.role_labels" },
  // "AI" / internal layer + model names — never user-facing
  { category: "no-ai", re: /\bAI\b/, hint: "describe the system as synthesizing real feedback" },
  { category: "no-ai", re: /artificial intelligence/i, hint: "never reference AI on a user surface" },
  { category: "no-ai", re: /\bAnthropic\b/, hint: "internal layer/model names are never shown" },
  { category: "no-ai", re: /\bClaude\b/, hint: "internal layer/model names are never shown" },
];

const EXTS = new Set([".ts", ".tsx"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTS.has(path.extname(full))) yield full;
  }
}

const hits = [];
for (const file of walk(srcDir)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes("contract-lint-ignore")) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        hits.push({ file: path.relative(srcDir, file), line: i + 1, category: rule.category, hint: rule.hint, text: line.trim() });
      }
    }
  });
}

if (hits.length > 0) {
  console.error(`\n✗ contract lint failed — ${hits.length} violation(s):\n`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  [${h.category}]  ${h.hint}`);
    console.error(`    > ${h.text}`);
  }
  console.error("");
  process.exit(1);
}
console.log("✓ contract lint clean (no hardcoded role words, no \"AI\"/internal layer names)");

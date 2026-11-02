#!/usr/bin/env node
/**
 * ISA Phase 0.3 — isa-provenance-hash-gate (executable)
 * Fail closed on missing/mismatched provenance hashes.
 * On failure: write socratic diagnostic.md with seven questions, exit 1.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECEIPT_DIR = join(ROOT, "fixtures", "receipts");

const REQUIRED = [
  "pre_expansion_ast_hash",
  "post_expansion_ast_hash",
  "controls_snapshot_hash",
  "pairwise_scores_hash",
  "artifact_sha256",
];

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function listReceipts(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".provenance.json")) out.push(join(dir, name));
  }
  return out.sort();
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveBytes(receipt, fieldPath) {
  const rel = receipt.bytes?.[fieldPath];
  if (!rel) return null;
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs);
}

function recompute(receipt) {
  const observed = {};
  const pre = resolveBytes(receipt, "pre_expansion_ast");
  const post = resolveBytes(receipt, "post_expansion_ast");
  const controls = resolveBytes(receipt, "controls_snapshot");
  const pairwise = resolveBytes(receipt, "pairwise_scores");
  const artifact = resolveBytes(receipt, "artifact");

  if (pre) observed.pre_expansion_ast_hash = sha256(pre);
  if (post) observed.post_expansion_ast_hash = sha256(post);
  if (controls) observed.controls_snapshot_hash = sha256(controls);
  if (pairwise) observed.pairwise_scores_hash = sha256(pairwise);
  if (artifact) observed.artifact_sha256 = sha256(artifact);

  if (receipt.resolution_bin && receipt.resolution_bin.length > 0) {
    const binBytes = Buffer.from(JSON.stringify(receipt.resolution_bin) + "\n", "utf8");
    observed.resolution_bin_digest = sha256(binBytes);
  }
  return observed;
}

function stageGuess(field) {
  const map = {
    pre_expansion_ast_hash: "LexiconExpand",
    post_expansion_ast_hash: "LexiconExpand",
    controls_snapshot_hash: "LexiconExpand",
    pairwise_scores_hash: "pairwise",
    artifact_sha256: "render",
    resolution_bin_digest: "LexiconExpand",
  };
  return map[field] ?? "fixture";
}

function writeDiagnostic(failures) {
  const lines = [
    "# Socratic hash diagnostic — isa-provenance-hash-gate",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];
  for (const f of failures) {
    lines.push(`## Receipt \`${f.receipt}\``);
    lines.push("");
    lines.push(`### Field \`${f.field}\` (${f.kind})`);
    lines.push("");
    lines.push(`**Q1 — What hash was expected?**`);
    lines.push(f.expected ?? "_(missing)_");
    lines.push("");
    lines.push(`**Q2 — What hash was observed (recomputed from bytes)?**`);
    lines.push(f.observed ?? "_(could not recompute — bytes missing)_");
    lines.push("");
    lines.push(`**Q3 — Which pipeline stage last wrote that field?**`);
    lines.push(stageGuess(f.field));
    lines.push("");
    lines.push(`**Q4 — Which control or pairwise parameter differs between the two control snapshots, if both exist?**`);
    lines.push(f.controlDiff ?? "No dual snapshot available in this failure; inspect controls_snapshot bytes vs receipt.hashes.");
    lines.push("");
    lines.push(`**Q5 — Did only surface wording change while post_expansion_ast_hash stayed equal?**`);
    lines.push(f.surfaceOnly ?? "Compare pre/post AST bytes; if post hashes match across wording variants, surface-only is true.");
    lines.push("");
    lines.push(`**Q6 — Was a ResolutionBin entry promoted without rehash?**`);
    lines.push(f.binPromotion ?? "Check resolution_bin statuses for resolved_accept without updated post_expansion_ast_hash / artifact_sha256.");
    lines.push("");
    lines.push(`**Q7 — What is the smallest next experiment?**`);
    lines.push(
      f.nextExperiment ??
        "Re-run with expansion_policy=exact_only, max_edit_distance=0, pairwise_enable=false; if green, bisect which control reintroduced the drift."
    );
    lines.push("");
    lines.push(`**Likely root cause (proposed):** ${f.likelyCause}`);
    lines.push("");
  }
  const out = join(ROOT, "diagnostic.md");
  writeFileSync(out, lines.join("\n"), "utf8");
  return out;
}

function main() {
  const receipts = listReceipts(RECEIPT_DIR);
  const failures = [];

  if (receipts.length === 0) {
    failures.push({
      receipt: "(none)",
      field: "receipt_glob",
      kind: "missing",
      expected: "at least one fixtures/receipts/*.provenance.json",
      observed: null,
      likelyCause: "No provenance receipts present — fail closed.",
      nextExperiment: "Add a receipt under fixtures/receipts/ with bytes paths and hashes, then re-run.",
    });
  }

  for (const path of receipts) {
    const receipt = loadJson(path);
    const expected = receipt.hashes ?? {};
    const observed = recompute(receipt);

    for (const field of REQUIRED) {
      if (!expected[field]) {
        failures.push({
          receipt: path,
          field,
          kind: "missing",
          expected: null,
          observed: observed[field] ?? null,
          likelyCause: `Required hash ${field} absent from receipt.`,
        });
        continue;
      }
      if (!observed[field]) {
        failures.push({
          receipt: path,
          field,
          kind: "missing_bytes",
          expected: expected[field],
          observed: null,
          likelyCause: `Cannot recompute ${field} — bytes path missing or unreadable.`,
        });
        continue;
      }
      if (expected[field] !== observed[field]) {
        failures.push({
          receipt: path,
          field,
          kind: "mismatch",
          expected: expected[field],
          observed: observed[field],
          likelyCause: `Mismatch on ${field}: receipt does not match recomputed digest from declared bytes.`,
        });
      }
    }

    if (receipt.resolution_bin && receipt.resolution_bin.length > 0) {
      if (!expected.resolution_bin_digest) {
        failures.push({
          receipt: path,
          field: "resolution_bin_digest",
          kind: "missing",
          expected: null,
          observed: observed.resolution_bin_digest ?? null,
          likelyCause: "Non-empty ResolutionBin without resolution_bin_digest — fail closed.",
        });
      } else if (expected.resolution_bin_digest !== observed.resolution_bin_digest) {
        failures.push({
          receipt: path,
          field: "resolution_bin_digest",
          kind: "mismatch",
          expected: expected.resolution_bin_digest,
          observed: observed.resolution_bin_digest,
          likelyCause: "ResolutionBin digest mismatch — bin mutated without receipt update.",
          binPromotion: "Possible promote-without-rehash; audit resolved_accept entries.",
        });
      }
    }
  }

  if (failures.length > 0) {
    const report = writeDiagnostic(failures);
    console.error(`isa-provenance-hash-gate FAILED (${failures.length} issue(s)). Wrote ${report}`);
    process.exit(1);
  }

  console.log(`isa-provenance-hash-gate OK — ${receipts.length} receipt(s) verified.`);
}

main();

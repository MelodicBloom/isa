#!/usr/bin/env node
/**
 * ISA Phase 0.3 — fixture gate runner (stubs until runtimes exist).
 * F01–F08 core fixtures; F09–F14 lexicon / LexiconExpand fixtures.
 * Patterned on MelodicBloom/shader-grammar validate: checkout → node 22 → gates.
 * Design-enforceable: each fixture must eventually emit a provenance receipt
 * that passes isa-provenance-hash-gate.
 */

const FIXTURES = [
  { id: "ISA-F01", title: "Stable multi-instance target binding" },
  { id: "ISA-F02", title: "Fluorescence excitation extinction" },
  { id: "ISA-F03", title: "Phosphorescence decay profile" },
  { id: "ISA-F04", title: "Iridescence observer separation" },
  { id: "ISA-F05", title: "Quiescence and effervescence clock gate" },
  { id: "ISA-F06", title: "Incandescence and deliquescence material coupling" },
  { id: "ISA-F07", title: "Deterministic snapshot replay" },
  { id: "ISA-F08", title: "Performance and footprint degradation" },
  { id: "ISA-F09", title: "Synonym expands to same operator AST hash" },
  { id: "ISA-F10", title: "near_synonym respects policy and records confidence" },
  { id: "ISA-F11", title: "antonym_blocked routes to ResolutionBin" },
  { id: "ISA-F12", title: "Expansion cannot invent non-registry operator or COALESCE" },
  { id: "ISA-F13", title: "Collision C-rules identical after expansion" },
  { id: "ISA-F14", title: "Receipt dual AST hashes; output digest stable under wording-only change" },
];

const mode = process.env.ISA_FIXTURE_MODE ?? "declare";

if (mode === "declare") {
  console.log("ISA fixture gates (Phase 0.3) — declared, runtime not yet implemented:");
  for (const f of FIXTURES) {
    console.log(`  [declared] ${f.id} — ${f.title}`);
  }
  console.log("Promote to validated_fixture still requires green isa-provenance-hash-gate plus measured fixtures.");
  process.exit(0);
}

console.error("ISA_FIXTURE_MODE=run is not implemented yet (no adapter/runtime). Fail closed.");
process.exit(1);

# ISA Phase 0.3 — enforceable contract notes

## CI layout

- **Workflow (GitHub Actions, auto-run):** [`.github/workflows/isa-provenance-hash-gate.yml`](./.github/workflows/isa-provenance-hash-gate.yml)
- **Executable:** [`scripts/isa-provenance-hash-gate.mjs`](./scripts/isa-provenance-hash-gate.mjs)
- **Fixture gates:** [`scripts/run-fixture-gates.mjs`](./scripts/run-fixture-gates.mjs)
- **Full contract:** [`docs/PHASE-0.3-ISA-CONTRACT.md`](./docs/PHASE-0.3-ISA-CONTRACT.md)

The workflow checks out the repo, runs Node 22, recomputes provenance hashes from bytes (fail closed), uploads `diagnostic.md` on failure, then runs fixture gates F01–F14 (lexicon F09–F14) as a separate job.

## Fail closed

Missing or mismatched `pre_expansion_ast_hash`, `post_expansion_ast_hash`, `controls_snapshot_hash`, `pairwise_scores_hash`, or `artifact_sha256` fails the job. Non-empty `resolution_bin` without a matching `resolution_bin_digest` also fails.

## LexiconExpand constraints preserved

- `max_edit_distance` default **1** (range 0–2)
- ResolutionBin for soft failures (antonym_blocked, unknown, policy miss)
- Pairwise parameters recorded in controls / pairwise snapshot
- `fail_on_nonempty_bin` default **false**
- Provenance stores controls snapshot and both AST hashes

## Promote gate

`validated_fixture` requires green `isa-provenance-hash-gate` plus F01–F08 and lexicon F09–F14.

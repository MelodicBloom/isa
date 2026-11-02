# ISA Phase 0.3 — enforceable contract notes

## CI layout

- **Canonical gate file (repository root):** [`isa-provenance-hash-gate.yml`](./isa-provenance-hash-gate.yml)
- **Executable:** [`scripts/isa-provenance-hash-gate.mjs`](./scripts/isa-provenance-hash-gate.mjs)
- **Thin Actions pointer:** [`.github/workflows/isa-ci.yml`](./.github/workflows/isa-ci.yml)

GitHub Actions only auto-runs workflows under `.github/workflows/`. The root YAML is the Phase 0.3 source of truth; the thin pointer checks out the repo, runs Node 22, invokes the root-adjacent script, uploads `diagnostic.md` on failure, then runs fixture gate declarations.

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

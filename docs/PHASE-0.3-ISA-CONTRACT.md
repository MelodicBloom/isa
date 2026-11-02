# ISA Phase 0.3 — Contract (design-only)

> **Status:** proposed design. This document specifies contracts only; it does not ship a LexiconExpand runtime. Normative keywords (MUST, MUST NOT, SHOULD) apply to future implementations and to the CI gate.
>
> Machine-readable companion: [`contracts/lexicon-expand.phase-0.3.yaml`](../contracts/lexicon-expand.phase-0.3.yaml). Runnable CI: [`.github/workflows/isa-provenance-hash-gate.yml`](../.github/workflows/isa-provenance-hash-gate.yml).

## Softening summary (read first)

Phase 0.3 replaces several hard aborts with a **ResolutionBin soft-fail path** (`bin_and_continue`):

| Control | Strict design value | Phase 0.3 effective default |
|---|---|---|
| `expansion_policy` | `exact_only` | softened to `bin_and_continue` (anything outside `exact_only` is binned, pipeline continues) |
| `on_unknown` | `error` | softened to `bin_and_continue` |
| `on_antonym_blocked` | `error` (fixed, no override) | softened to **always bin, never auto-enter collision** |

Invariants that softening does NOT relax:

- `antonym_blocked` entries **never** auto-enter collision, regardless of any score.
- **No COALESCE auto-entry**: expansion cannot synthesize COALESCE or any merge operator.
- OperatorClaims come **only** from the twelve-operator registry.
- ResolutionBin entries are not OperatorClaims; they enter collision only after a human or a ResolveBin pass, and promotion requires rehash.
- `fail_on_nonempty_bin` default **false** (a non-empty bin does not fail the run, but its `resolution_bin_digest` MUST be present in provenance).

---

## Part 1 — LexiconExpand stage

### Placement

After **parse** and before **target bind**:

```
parse → LexiconExpand → target bind → collide → render
```

LexiconExpand emits OperatorClaims only; it never writes fields directly.

### Inputs

| Input | Description |
|---|---|
| `instruction_ast` | AST produced by parse |
| `surface_tokens` | surface token stream of the instruction |
| `lexicon_registry_version` | pinned version of the lexicon registry |
| `AssociationRecord[]` | array of association records (schema below) |
| `NeighborWordSet` per token | nearest-neighbor word set for each surface token |
| `LexiconExpandControls` | controls (Part 2) including `PairwiseExpandParams` (Part 3) |

### Outputs

| Output | Description |
|---|---|
| `expanded_ast` | AST after expansion |
| `expansion_trace` | ordered trace of applied/considered expansions, each with `edge_ids` and `confidence` (and per-pair scores, Part 3) |
| `pre_expansion_ast_hash` | SHA-256 of canonical `instruction_ast` bytes |
| `post_expansion_ast_hash` | SHA-256 of canonical `expanded_ast` bytes |
| diagnostics | `ISA100` or `ISA110` |

### AssociationRecord

| Field | Type | Constraint |
|---|---|---|
| `association_id` | string | unique |
| `source_lemma` | string | |
| `relation` | enum | `synonym` \| `near_synonym` \| `antonym_blocked` \| `entails` \| `co_occurs_with` \| `maps_to_primitive` |
| `target_operator_id` | string | from the **twelve-operator registry only** |
| `confidence` | number | 0..1 |
| `evidence_class` | enum | from the **existing six evidence classes** |
| `status` | enum | `draft` \| `validated_fixture` \| `applied` \| `canonical` |

---

## Part 2 — LexiconExpandControls (with defaults)

| Control | Type / range | Default | Notes |
|---|---|---|---|
| `expansion_policy` | enum `exact_only` \| `allow_near` \| `require_human` | `exact_only` | **softened to `bin_and_continue`** |
| `max_expansions_per_token` | integer 1..8 | `1` | |
| `min_confidence` | number 0..1 | `0.85` for `synonym`; `0.95` for `near_synonym` when `allow_near` | |
| `allow_entails` | boolean | `false` | |
| `allow_co_occurs` | boolean | `false` | |
| `maps_to_primitive_required` | boolean | `true` when bridging to shader-grammar | |
| `on_unknown` | enum `error` \| `omit_with_ISA110` \| `hold_for_human` | `error` | **softened to `bin_and_continue`** |
| `on_antonym_blocked` | enum `error` | `error`, fixed, no override | **softened to always bin, never auto-enter collision** |
| `multi_match_policy` | enum `reject` \| `rank_by_confidence` \| `require_human` | `reject` | |
| `weight_inheritance` | enum `copy_raw` \| `copy_canonical_band` \| `scale_by_confidence` | `copy_raw` | |
| `collide_after_expand` | boolean | `true` | |
| `max_edit_distance` | integer 0..2 | `1` | When `nearest_neighbor_metric` is `edit_distance`, a neighbor edge is eligible only if edit distance ≤ `max_edit_distance` |
| `fail_on_nonempty_bin` | boolean | `false` | Preserved constraint |

---

## Part 3 — PairwiseExpandParams

| Param | Type / range | Default | Meaning |
|---|---|---|---|
| `pairwise_enable` | boolean | `true` when `max_expansions_per_token > 1`, else `false` | |
| `pairwise_window` | integer 1..5 | `2` | How many nearest-neighbor edges, by lexicon distance, are paired with each association |
| `cross_term_weight` | number 0..1 | `0.35` | Multiplies the geometric mean of the two edge confidences |
| `mutual_support_bonus` | number 0..0.25 | `0.1` | Added when both edges share the same `target_operator_id` |
| `conflict_penalty` | number 0..1 | `0.5` | Subtracted when relations disagree (e.g. `synonym` vs `antonym_blocked`) or two edges map to different operators under `multi_match_policy: reject` |
| `nearest_neighbor_metric` | enum `embedding_cosine` \| `edit_distance` \| `lexicon_hop` | `lexicon_hop` | |
| `min_pairwise_score` | number 0..1 | `0.6` | A pair below this is dropped from ranking but kept in `expansion_trace` |
| `pair_aggregation` | enum `max` \| `mean` \| `softmax` | `max` | |
| `softmax_temperature` | number 0.1..2 | `1` | Used only when `pair_aggregation` is `softmax` |

### pair_score

```
pair_score = clamp_0_1(
    confidence_A * confidence_N * cross_term_weight
  + (mutual_support_bonus if A.target_operator_id == N.target_operator_id else 0)
  - (conflict_penalty     if relations or targets conflict              else 0)
)
survives = pair_score >= min_pairwise_score
```

(`cross_term_weight` multiplies the geometric mean of the two confidences as defined above; the product form is the stated formula.)

Rules:

1. Surviving pairs feed `multi_match_policy` ranking **before** `collide_after_expand`.
2. **Antonym pairs always fail closed regardless of score** (routed to ResolutionBin; never auto-enter collision).
3. Dropped pairs remain in `expansion_trace` with their scores.
4. Provenance records `pairwise_params` and per-pair scores alongside **both** AST hashes.

---

## ResolutionBin

- Soft-fail sink for `on_unknown`, `antonym_blocked`, and policy misses (`bin_and_continue`).
- Entries are not OperatorClaims; they enter collision only after a human or ResolveBin pass.
- `antonym_blocked` always bins and never auto-enters collision.
- No COALESCE auto-entry. Claims only from the twelve-operator registry.
- Promotion of a bin entry MUST rehash (`post_expansion_ast_hash`, `resolution_bin_digest`).
- `fail_on_nonempty_bin` default `false`.

## Provenance

Receipts MUST store: controls snapshot (including `max_edit_distance` and all pairwise params), `pre_expansion_ast_hash`, `post_expansion_ast_hash`, `pairwise_scores_hash` / per-pair scores, `artifact_sha256`, and `resolution_bin_digest` (required when the bin is non-empty, else null allowed), plus bin entries with reason codes.

---

## CI — isa-provenance-hash-gate

Runnable workflow: **`.github/workflows/isa-provenance-hash-gate.yml`** (auto-run by GitHub Actions on push and pull_request). There is no root-level gate file and no pointer workflow. Patterned on shader-grammar validate: checkout → Node 22 → recompute hashes → diagnostic on failure. Executables: `scripts/isa-provenance-hash-gate.mjs`, `scripts/run-fixture-gates.mjs`.

### Collect

- Receipt glob: `fixtures/receipts/**/*.provenance.json`
- Bytes roots: `fixtures/receipts`, `fixtures/ast`, `fixtures/artifacts`
- Required fields: `pre_expansion_ast_hash`, `post_expansion_ast_hash`, `controls_snapshot_hash`, `pairwise_scores_hash`, `artifact_sha256`, `resolution_bin_digest` (required when `resolution_bin` non-empty; else null allowed)

### Fail closed

`missing_required_hash: fail`, `mismatched_recomputed_hash: fail`, `soft_pass: false`, `skip_allowed: false`. Every hash is recomputed from bytes.

### socratic-hash-diagnostic (on failure)

Writes `diagnostic.md`, uploaded as artifact `socratic-hash-diagnostic`; the job fails.

- **Q1** What hash was expected?
- **Q2** What hash was observed (recomputed from bytes)?
- **Q3** Which pipeline stage last wrote that field (LexiconExpand | pairwise | collide | render | fixture)?
- **Q4** Which control or pairwise parameter differs between the two control snapshots, if both exist?
- **Q5** Did only surface wording change while `post_expansion_ast_hash` stayed equal?
- **Q6** Was a ResolutionBin entry promoted without rehash?
- **Q7** What is the smallest next experiment (e.g. `exact_only` + `max_edit_distance 0`, or `pairwise_enable false`)?

### Controls snapshot must include

`expansion_policy`, `max_expansions_per_token`, `min_confidence`, `max_edit_distance` (0..2, default 1), `nearest_neighbor_metric`, `pairwise_enable`, `pairwise_window`, `cross_term_weight`, `mutual_support_bonus`, `conflict_penalty`, `min_pairwise_score`, `pair_aggregation`, `fail_on_nonempty_bin` (default false), `collide_after_expand`.

### Fixture gates and promote gate

Separate job `fixture-gates` (needs the hash gate): F01–F14, including lexicon fixtures F09–F14. Promotion to `validated_fixture` requires: green `isa-provenance-hash-gate`, fixture gates F01–F08, and lexicon fixture gates F09–F14.

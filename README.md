# MelodicBloom / isa

**ISA Phase 0.3** — Instruction Semantic Assembly.

Provenance receipts, LexiconExpand (associations / neighbor words → typed OperatorClaims), collision resolution, fixture ladder, and a fail-closed SHA-256 hash CI gate with Socratic diagnostics.

## Quick CI

```bash
npm run ci:hash-gate   # fail closed on missing/mismatched hashes
npm run ci:fixtures    # declare F01–F14 (runtime TBD)
```

Canonical gate contract: [`isa-provenance-hash-gate.yml`](./isa-provenance-hash-gate.yml) at **repository root**.

See [`CONTRACT.md`](./CONTRACT.md).

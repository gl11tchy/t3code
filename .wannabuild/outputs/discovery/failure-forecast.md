# Failure forecast (backfilled from approved plan — Risk summary)

- Private shadcn registries (`@coss`/`@spell`): highest-likelihood blocker — never `shadcn add`; restyle existing primitives via tokens/`glitch-theme.css` only.
- Fable version-gating: too-old local Claude Code silently falls back off Fable — acceptable by design (resolver degrades gracefully; don't hard-pin).
- `index.css` merge conflicts: mitigated by values-only edits + separate `glitch-theme.css`.
- Spawn-loop partial failure (Phase 3): main new-code correctness risk — tolerate per-thread failure, surface per-agent errors.
- Shadow-home config redirection: the one plausible hidden gap in "config already unified" — verify explicitly in Phase 4.
- Icon artwork doesn't exist yet: swap-in-place when available; don't block the reskin on it.
- Fork smear risk: edits leaking through high-churn files (esp. `ClaudeAdapter.ts` ~3900 lines) — forbidden to touch; keep a rebase conflict map of every existing-file line edited.

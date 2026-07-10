/**
 * GLITCHY (gl11tchy): fork-owned model routing policy.
 *
 * Keep Haiku in catalogs as a last-resort fallback, but hide it from normal
 * picker routing and never use it for git/PR text generation. Lives in
 * `packages/shared` (runtime) — not contracts — so schemas stay policy-free.
 */

/** Exact slugs known to be Haiku (plus aliases). Prefer `isForkHiddenModelSlug`. */
export const FORK_HIDDEN_MODEL_SLUGS: ReadonlyArray<string> = [
  "claude-haiku-4-5",
  "claude-haiku-4.5",
  "claude-haiku-4-5-20251001",
  "haiku",
  "haiku-4.5",
];

/**
 * True when a model slug is Haiku (exact alias or any slug containing "haiku").
 * Used for picker hiding and text-generation rewrite.
 */
export function isForkHiddenModelSlug(model: string): boolean {
  const slug = model.trim().toLowerCase();
  if (slug.length === 0) {
    return false;
  }
  if (FORK_HIDDEN_MODEL_SLUGS.some((candidate) => candidate === slug)) {
    return true;
  }
  // Catch dated / future Haiku variants without listing every catalog slug.
  return slug.includes("haiku");
}

/** @deprecated Prefer `isForkHiddenModelSlug` — same predicate for text-gen rewrites. */
export const isForbiddenTextGenerationModel = isForkHiddenModelSlug;

/** @deprecated Prefer `FORK_HIDDEN_MODEL_SLUGS`. */
export const FORBIDDEN_TEXT_GENERATION_MODEL_SLUGS = FORK_HIDDEN_MODEL_SLUGS;

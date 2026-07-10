/**
 * Fork policy: keep Haiku in the catalog as a fallback of last resort, but hide
 * it from the picker so users do not choose it during normal routing.
 *
 * Policy lives in `@t3tools/shared/glitchModelPolicy` so server + web share one
 * definition; this module re-exports the web-facing names.
 */
export {
  FORK_HIDDEN_MODEL_SLUGS as HIDDEN_MODEL_SLUGS,
  isForkHiddenModelSlug,
  isForkHiddenModelSlug as isHiddenModelSlug,
} from "@t3tools/shared/glitchModelPolicy";

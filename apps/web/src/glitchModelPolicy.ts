/**
 * Fork policy: keep Haiku in the catalog as a fallback of last resort, but hide
 * it from the picker so users do not choose it during normal routing.
 */
export const HIDDEN_MODEL_SLUGS: ReadonlyArray<string> = ["claude-haiku-4-5"];

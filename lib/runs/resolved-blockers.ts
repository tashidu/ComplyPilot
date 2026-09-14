import { z } from "zod";

/** Findings a client may mark resolved. Anything else is rejected outright. */
export const KNOWN_BLOCKER_IDS = ["invoice", "supplier", "customs", "schedule"] as const;

export const ResolvedBlockersSchema = z.array(z.enum(KNOWN_BLOCKER_IDS)).max(50);

/**
 * Parses the JSON-encoded resolvedBlockers form field used by /api/analyze.
 * Malformed JSON, a non-array, or an unknown id are all treated the same way
 * (null): a client error, not a 500, and validating the ids also stops an
 * arbitrary string being marked resolved.
 */
export function parseResolvedBlockers(raw: FormDataEntryValue | null): string[] | null {
  if (raw === null || raw === "") return [];
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ResolvedBlockersSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

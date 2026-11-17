import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft, NoteDraftStatus } from "./lib/draft";

/**
 * What the lesson note editor shows for the text in the box: the character
 * count against the limit, whether Save is enabled, and the status line.
 * `savedBody` is the note as last saved, or null when there is none yet.
 */
export function describeNoteDraft(
  draft: string,
  savedBody: string | null,
  max: number
): NoteDraft {
  return describeDraft(draft, savedBody, max);
}

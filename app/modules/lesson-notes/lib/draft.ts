export type NoteDraftStatus =
  | { kind: "empty" }
  | { kind: "too-long"; overBy: number }
  | { kind: "unsaved" }
  | { kind: "saved" };

export type NoteDraft = {
  length: number;
  max: number;
  canSave: boolean;
  status: NoteDraftStatus;
};

// The action trims a note before it validates and saves it, so the draft is
// judged as the server will see it.
export function describeDraft(
  draft: string,
  savedBody: string | null,
  max: number
): NoteDraft {
  const trimmed = draft.trim();
  const status = statusOf(trimmed, savedBody, max);
  return {
    length: trimmed.length,
    max,
    canSave: status.kind === "unsaved",
    status,
  };
}

function statusOf(
  trimmed: string,
  savedBody: string | null,
  max: number
): NoteDraftStatus {
  if (trimmed.length > max)
    return { kind: "too-long", overBy: trimmed.length - max };
  if (trimmed === savedBody) return { kind: "saved" };
  if (trimmed.length === 0) return { kind: "empty" };
  return { kind: "unsaved" };
}

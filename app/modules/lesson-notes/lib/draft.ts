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

export function describeDraft(
  draft: string,
  savedBody: string | null,
  max: number
): NoteDraft {
  const length = draft.length;
  const status = statusOf(draft, savedBody, max);
  return {
    length,
    max,
    canSave: status.kind === "unsaved",
    status,
  };
}

function statusOf(
  draft: string,
  savedBody: string | null,
  max: number
): NoteDraftStatus {
  if (draft.length > max)
    return { kind: "too-long", overBy: draft.length - max };
  if (draft === savedBody) return { kind: "saved" };
  // The action rejects a blank note, so a whitespace-only draft is not saveable.
  if (draft.trim().length === 0) return { kind: "empty" };
  return { kind: "unsaved" };
}

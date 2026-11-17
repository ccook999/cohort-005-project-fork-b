import { useState } from "react";
import { useFetcher } from "react-router";
import { CheckCircle2, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import {
  describeNoteDraft,
  type NoteDraftStatus,
} from "~/modules/lesson-notes";

export type SavedNote = { body: string; updatedAt: string } | null;

// Laid out like the Questions & Discussion card below it, so the two read as
// one family of lesson sections.
export function LessonNote({ note }: { note: SavedNote }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;
  const draft = describeNoteDraft(body, note?.body ?? null, MAX_NOTE_LENGTH);

  return (
    <Card className="mb-8">
      <CardContent>
        <NoteHeading />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What stood out in this lesson?"
            aria-label="Your notes"
            className="resize-y"
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !draft.canSave}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            {error ? (
              <span className="text-sm text-destructive">{error}</span>
            ) : (
              <NoteStatus status={draft.status} updatedAt={note?.updatedAt} />
            )}
            <span
              className={cn(
                "ml-auto text-xs",
                draft.status.kind === "too-long"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {draft.length} / {draft.max}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteHeading() {
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your Notes</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Private to you. Jot things down while you watch.
      </p>
    </>
  );
}

function NoteStatus({
  status,
  updatedAt,
}: {
  status: NoteDraftStatus;
  updatedAt: string | undefined;
}) {
  switch (status.kind) {
    case "saved":
      return (
        <span
          suppressHydrationWarning
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <CheckCircle2 className="size-3.5 text-green-600" />
          Saved{updatedAt && ` · edited ${formatRelativeTime(updatedAt)}`}
        </span>
      );
    case "unsaved":
      return (
        <span className="text-xs text-muted-foreground">Unsaved changes</span>
      );
    case "too-long":
      return (
        <span className="text-xs text-destructive">
          {status.overBy} characters over the limit
        </span>
      );
    case "empty":
      return null;
  }
}

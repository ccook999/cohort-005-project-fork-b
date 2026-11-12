import { z } from "zod";

// A Note is plain text, trimmed, and capped on write. See GLOSSARY.md.
export const MAX_NOTE_LENGTH = 2000;

/** The save-note form: an over-long Note is refused, never truncated. */
export const saveNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something before saving your note.")
    .max(
      MAX_NOTE_LENGTH,
      `A note can be at most ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`
    ),
});

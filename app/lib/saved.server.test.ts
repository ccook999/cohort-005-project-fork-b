import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";
import { MAX_NOTE_LENGTH, saveNoteSchema } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const EARLIER = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("toggling a Bookmark", () => {
  it("bookmarks an unbookmarked Lesson, then un-bookmarks it", () => {
    const student = base.user.id;

    expect(toggleBookmark(db, student, lessonIds[0], EARLIER)).toBe(true);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, student, lessonIds[0], LATER)).toBe(false);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    const student = base.user.id;
    toggleBookmark(db, student, lessonIds[0], EARLIER);
    toggleBookmark(db, student, lessonIds[0], EARLIER);
    toggleBookmark(db, student, lessonIds[0], EARLIER);

    expect(listBookmarks(db, student)).toHaveLength(1);
    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: student, lessonId: lessonIds[0] })
        .run()
    ).toThrow(/UNIQUE/);
  });
});

describe("saving a Note", () => {
  it("creates a Note on a Lesson with none", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thoughts", EARLIER);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "First thoughts",
      updatedAt: EARLIER.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thoughts", EARLIER);
    saveNote(db, base.user.id, lessonIds[0], "Second thoughts", LATER);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thoughts",
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("has no Note for a Lesson the Student has not written on", () => {
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("keeps what the Student typed as plain text", () => {
    const body = "# not a heading\n*not emphasis*";
    saveNote(db, base.user.id, lessonIds[0], body, EARLIER);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });
});

describe("the Note form", () => {
  it("accepts a Note of exactly 2,000 characters", () => {
    const result = saveNoteSchema.safeParse({
      body: "a".repeat(MAX_NOTE_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("refuses a Note over 2,000 characters with a message", () => {
    const result = saveNoteSchema.safeParse({
      body: "a".repeat(MAX_NOTE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "A note can be at most 2,000 characters."
    );
  });

  it("trims the body before checking its length", () => {
    const result = saveNoteSchema.safeParse({
      body: `  ${"a".repeat(MAX_NOTE_LENGTH)}  `,
    });
    expect(result.data?.body).toBe("a".repeat(MAX_NOTE_LENGTH));
  });
});

describe("the Saved lists", () => {
  it("lists only the Student's own Bookmarks, newest first, with Lesson and Course", () => {
    const other = addStudent("Other");
    toggleBookmark(db, base.user.id, lessonIds[0], EARLIER);
    toggleBookmark(db, base.user.id, lessonIds[1], LATER);
    toggleBookmark(db, other.id, lessonIds[0], LATER);

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      {
        lessonId: lessonIds[1],
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1" },
    ]);
  });

  it("lists only the Student's own Notes, last edited first, with Lesson and Course", () => {
    const other = addStudent("Other");
    saveNote(db, base.user.id, lessonIds[0], "Mine, older", EARLIER);
    saveNote(db, base.user.id, lessonIds[1], "Mine, newer", LATER);
    saveNote(db, other.id, lessonIds[0], "Not mine", LATER);

    const notes = listNotes(db, base.user.id);
    expect(notes.map((note) => note.body)).toEqual([
      "Mine, newer",
      "Mine, older",
    ]);
    expect(notes[0]).toMatchObject({
      lessonId: lessonIds[1],
      lessonTitle: "Lesson 2",
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });

  it("puts a re-saved older Note back at the top", () => {
    saveNote(db, base.user.id, lessonIds[0], "Older", EARLIER);
    saveNote(db, base.user.id, lessonIds[1], "Newer", EARLIER);
    saveNote(db, base.user.id, lessonIds[0], "Older, edited", LATER);

    expect(listNotes(db, base.user.id)[0].body).toBe("Older, edited");
  });
});

import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";

describe("describeNoteDraft", () => {
  it("is empty with nothing saved and nothing typed", () => {
    const draft = describeNoteDraft("", null, 10);
    expect(draft).toEqual({
      length: 0,
      max: 10,
      canSave: false,
      status: { kind: "empty" },
    });
  });

  it("is unsaved, and saveable, once something is typed", () => {
    const draft = describeNoteDraft("hello", null, 10);
    expect(draft.status).toEqual({ kind: "unsaved" });
    expect(draft.canSave).toBe(true);
    expect(draft.length).toBe(5);
  });

  it("is saved when the draft matches the saved note", () => {
    const draft = describeNoteDraft("hello", "hello", 10);
    expect(draft.status).toEqual({ kind: "saved" });
    expect(draft.canSave).toBe(false);
  });

  it("is unsaved when the draft differs from the saved note", () => {
    const draft = describeNoteDraft("hello!", "hello", 10);
    expect(draft.status).toEqual({ kind: "unsaved" });
    expect(draft.canSave).toBe(true);
  });

  it("cannot save a whitespace-only draft", () => {
    expect(describeNoteDraft("   ", null, 10)).toMatchObject({
      canSave: false,
      status: { kind: "empty" },
    });
    expect(describeNoteDraft(" \n", "hello", 10)).toMatchObject({
      canSave: false,
      status: { kind: "empty" },
    });
  });

  it("allows a draft exactly at the limit", () => {
    const draft = describeNoteDraft("a".repeat(10), null, 10);
    expect(draft.status).toEqual({ kind: "unsaved" });
    expect(draft.canSave).toBe(true);
  });

  it("reports how far over the limit a draft is, and blocks saving", () => {
    const draft = describeNoteDraft("a".repeat(13), null, 10);
    expect(draft.status).toEqual({ kind: "too-long", overBy: 3 });
    expect(draft.canSave).toBe(false);
    expect(draft.length).toBe(13);
  });

  it("flags a saved note that is over a since-lowered limit", () => {
    const body = "a".repeat(11);
    expect(describeNoteDraft(body, body, 10).status).toEqual({
      kind: "too-long",
      overBy: 1,
    });
  });

  // The action trims before it saves, so the box keeps whitespace the saved
  // note dropped.
  it("is saved when the draft differs from the saved note only by surrounding whitespace", () => {
    const draft = describeNoteDraft("hello\n", "hello", 10);
    expect(draft.status).toEqual({ kind: "saved" });
    expect(draft.canSave).toBe(false);
  });

  it("does not count surrounding whitespace against the limit", () => {
    const draft = describeNoteDraft(`  ${"a".repeat(10)}\n`, null, 10);
    expect(draft.status).toEqual({ kind: "unsaved" });
    expect(draft.length).toBe(10);
  });
});

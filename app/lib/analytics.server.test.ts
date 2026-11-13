import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { getInstructorAnalytics } from "./analytics.server";

// Midday local time, so the refund window's local calendar days and the
// range's UTC cutoff land on the same date in any timezone a test runs in.
const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let admin: typeof schema.users.$inferSelect;
let otherInstructor: typeof schema.users.$inferSelect;
let otherCourse: typeof schema.courses.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  admin = db
    .insert(schema.users)
    .values({ name: "Admin", email: "admin@example.com", role: UserRole.Admin })
    .returning()
    .get();

  otherInstructor = db
    .insert(schema.users)
    .values({
      name: "Other Instructor",
      email: "other@example.com",
      role: UserRole.Instructor,
    })
    .returning()
    .get();

  otherCourse = db
    .insert(schema.courses)
    .values({
      title: "Other Course",
      slug: "other-course",
      description: "Someone else's course",
      salesCopy: markdown("## Other Course"),
      instructorId: otherInstructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
});

function purchase(courseId: number, amountPaid: number, createdAt: string) {
  db.insert(schema.purchases)
    .values({ userId: base.user.id, courseId, amountPaid, createdAt })
    .run();
}

function analyticsFor(
  viewer: { userId: number; isAdmin: boolean },
  params: Record<string, string> = {}
) {
  return getInstructorAnalytics(db, viewer, new URLSearchParams(params), NOW);
}

describe("getInstructorAnalytics", () => {
  describe("whose figures are shown", () => {
    it("pins an instructor to their own figures whatever the URL asks for", () => {
      purchase(base.course.id, 1000, daysBefore(1));
      purchase(otherCourse.id, 5000, daysBefore(1));

      const data = analyticsFor(
        { userId: base.instructor.id, isAdmin: false },
        { instructor: String(otherInstructor.id) }
      );

      expect(data.instructorId).toBe(base.instructor.id);
      expect(data.summary.grossCents).toBe(1000);
      expect(data.instructors).toEqual([]);
    });

    it("lets an admin pick an instructor, and shows everyone with none picked", () => {
      purchase(base.course.id, 1000, daysBefore(1));
      purchase(otherCourse.id, 5000, daysBefore(1));
      const viewer = { userId: admin.id, isAdmin: true };

      const picked = analyticsFor(viewer, {
        instructor: String(otherInstructor.id),
      });
      expect(picked.instructorId).toBe(otherInstructor.id);
      expect(picked.summary.grossCents).toBe(5000);

      const everyone = analyticsFor(viewer);
      expect(everyone.instructorId).toBeNull();
      expect(everyone.summary.grossCents).toBe(6000);
      expect(everyone.instructors.map((i) => i.id).sort()).toEqual(
        [base.instructor.id, otherInstructor.id].sort()
      );
    });

    it("drops a course the instructor does not own", () => {
      const viewer = { userId: base.instructor.id, isAdmin: false };

      const foreign = analyticsFor(viewer, {
        tab: "course",
        course: String(otherCourse.id),
      });
      expect(foreign.selectedCourseId).toBeNull();
      expect(foreign.funnel).toBeNull();

      const own = analyticsFor(viewer, {
        tab: "course",
        course: String(base.course.id),
      });
      expect(own.selectedCourseId).toBe(base.course.id);
      expect(own.funnel).not.toBeNull();
    });
  });

  describe("the range, measured from the injected now", () => {
    it("includes a purchase exactly on the cutoff and excludes one just before", () => {
      const cutoff = new Date(NOW.getTime() - 7 * 86_400_000);
      purchase(base.course.id, 100, cutoff.toISOString());
      purchase(base.course.id, 200, new Date(cutoff.getTime() - 1).toISOString());
      purchase(base.course.id, 400, daysBefore(0));

      const data = analyticsFor(
        { userId: base.instructor.id, isAdmin: false },
        { range: "7d" }
      );

      expect(data.range).toBe("7d");
      expect(data.summary.grossCents).toBe(500);
      expect(data.summary.purchaseCount).toBe(2);
    });

    it("charts every day from the cutoff to now, sales or not", () => {
      purchase(base.course.id, 1000, daysBefore(2));

      const { series } = analyticsFor(
        { userId: base.instructor.id, isAdmin: false },
        { range: "7d" }
      );

      expect(series.granularity).toBe("day");
      expect(series.points).toHaveLength(8);
      expect(series.points.at(-1)?.bucket).toBe(NOW.toISOString().slice(0, 10));
      expect(series.points.reduce((t, p) => t + p.grossCents, 0)).toBe(1000);
    });
  });

  describe("refund exposure", () => {
    it("counts purchases still inside their window, as of now", () => {
      purchase(base.course.id, 1000, daysBefore(0)); // 14 days left
      purchase(base.course.id, 2000, daysBefore(14)); // last day is today
      purchase(base.course.id, 4000, daysBefore(15)); // window closed

      const { refundExposure } = analyticsFor(
        { userId: base.instructor.id, isAdmin: false },
        { range: "30d" }
      );

      expect(refundExposure.grossCents).toBe(3000);
      expect(refundExposure.purchaseCount).toBe(2);
      expect(refundExposure.closingTodayCount).toBe(1);
      expect(refundExposure.sharePercent).toBe(43); // 3000 of 7000
      expect(refundExposure.courses).toEqual([
        {
          courseId: base.course.id,
          title: base.course.title,
          grossCents: 3000,
          purchaseCount: 2,
          daysLeft: 0,
        },
      ]);
    });
  });
});

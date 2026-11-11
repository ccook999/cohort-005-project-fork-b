// PROTOTYPE — throwaway Knock spike for "Does Knock hold up against Cadence?".
// Lives on the prototype/knock-spike branch only. Never merge.
import { Knock, signUserToken } from "@knocklabs/node";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "~/db";
import { comments, courses, lessons, modules, users } from "~/db/schema";

export const WORKFLOW_DISCUSSION_REPLY = "discussion-reply";
export const WORKFLOW_NEW_ENROLLMENT = "new-enrollment";
export const CATEGORY_NEW_ENROLLMENT = "new-enrollment";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`PROTOTYPE: ${name} missing from .env`);
  return v;
}

export const knock = () => new Knock({ apiKey: env("KNOCK_SECRET_API_KEY") });

type CadenceUser = typeof users.$inferSelect;

const recipient = (u: CadenceUser) => ({
  id: String(u.id),
  name: u.name,
  email: u.email,
});

export function getUser(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

// Check 1: the server signs an RS256 token for whoever the DevUI picked.
export async function signTokenFor(user: CadenceUser) {
  await knock().users.update(String(user.id), {
    name: user.name,
    email: user.email,
  });
  return signUserToken(String(user.id), {
    signingKey: env("KNOCK_SIGNING_KEY"),
    expiresInSeconds: 60 * 60,
  });
}

export function feedConfig() {
  return {
    publicKey: env("KNOCK_PUBLIC_API_KEY"),
    channelId: env("KNOCK_FEED_CHANNEL_ID"),
  };
}

// Real Discussion Questions (top-level comments) someone else asked, so a
// reply from the current user notifies their author.
export function questionsToReplyTo(currentUserId: number) {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      authorId: users.id,
      authorName: users.name,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseSlug: courses.slug,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .innerJoin(lessons, eq(lessons.id, comments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(
      and(
        isNull(comments.parentId),
        isNull(comments.deletedAt),
        ne(comments.userId, currentUserId)
      )
    )
    .limit(8)
    .all();
}

// Check 2: trigger a real catalogue Notification. Nothing is written to our DB.
export async function triggerDiscussionReply(
  actor: CadenceUser,
  questionId: number,
  replyBody: string
) {
  const q = questionsToReplyTo(actor.id).find((x) => x.id === questionId);
  if (!q) throw new Error("PROTOTYPE: question not found");
  const author = getUser(q.authorId)!;
  return knock().workflows.trigger(WORKFLOW_DISCUSSION_REPLY, {
    actor: recipient(actor),
    recipients: [recipient(author)],
    data: {
      question_excerpt: q.body.slice(0, 120),
      reply_excerpt: replyBody.slice(0, 120),
      lesson_title: q.lessonTitle,
      url: `/courses/${q.courseSlug}/lessons/${q.lessonId}#comment-${q.id}`,
    },
  });
}

// Check 4: new Enrollment → Instructor, off by default, opt-in.
export async function triggerNewEnrollmentTo(
  student: CadenceUser,
  instructor: CadenceUser
) {
  return knock().workflows.trigger(WORKFLOW_NEW_ENROLLMENT, {
    actor: recipient(student),
    recipients: [recipient(instructor)],
    data: { course_title: "PROTOTYPE course", student_name: student.name },
  });
}

export async function getPreferences(user: CadenceUser) {
  return knock().users.getPreferences(String(user.id), "default");
}

export async function setNewEnrollmentOptIn(user: CadenceUser, on: boolean) {
  return knock().users.setPreferences(String(user.id), "default", {
    __persistence_strategy__: "merge",
    categories: { [CATEGORY_NEW_ENROLLMENT]: on },
  });
}

export async function resetPreferences(user: CadenceUser) {
  return knock().users.unsetPreferences(String(user.id), "default");
}

// PROTOTYPE — throwaway Knock spike for "Does Knock hold up against Cadence?".
// Lives on the prototype/knock-spike branch only. Never merge.
// Run: npm run dev, then open /prototype/knock and switch users in the DevUI.
import { useCallback, useEffect, useState } from "react";
import { data, Form, useActionData } from "react-router";
import type { Route } from "./+types/prototype.knock";
import { getCurrentUserId } from "~/lib/session";
import {
  feedConfig,
  getPreferences,
  getUser,
  questionsToReplyTo,
  resetPreferences,
  setNewEnrollmentOptIn,
  signTokenFor,
  triggerDiscussionReply,
  triggerNewEnrollmentTo,
} from "~/lib/knock.prototype.server";
import { db } from "~/db";
import { users, UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";

async function requireUser(request: Request) {
  const id = await getCurrentUserId(request);
  const user = id ? getUser(id) : undefined;
  if (!user)
    throw data("Select a user from the DevUI panel.", { status: 401 });
  return user;
}

const safe = async <T,>(p: Promise<T>) => {
  try {
    return { ok: true as const, value: await p };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return { ok: false as const, error: `${err.status ?? ""} ${err.message}` };
  }
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const token = await safe(signTokenFor(user));
  const prefs = await safe(getPreferences(user));
  const instructors = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, UserRole.Instructor))
    .all();
  // Another real user, to prove my token can't read their feed.
  const other = db.select({ id: users.id }).from(users).all()
    .find((u) => u.id !== user.id);
  return {
    user: { id: user.id, name: user.name, role: user.role },
    token,
    feed: feedConfig(),
    prefs,
    questions: questionsToReplyTo(user.id),
    instructors,
    otherUserId: other?.id ?? null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  switch (intent) {
    case "reply":
      return { intent, result: await safe(triggerDiscussionReply(user,
        Number(form.get("questionId")), String(form.get("body") || "PROTOTYPE reply"))) };
    case "enroll": {
      const instructor = getUser(Number(form.get("instructorId")))!;
      return { intent, result: await safe(triggerNewEnrollmentTo(user, instructor)) };
    }
    case "opt-in":
      return { intent, result: await safe(setNewEnrollmentOptIn(user, true)) };
    case "opt-out":
      return { intent, result: await safe(setNewEnrollmentOptIn(user, false)) };
    case "reset-prefs":
      return { intent, result: await safe(resetPreferences(user)) };
  }
  return { intent, result: { ok: false as const, error: "unknown intent" } };
}

const API = "https://api.knock.app/v1";

// Check 3: the headless feed API, called straight from the browser with the
// public key + the server-signed user token. No Knock React components.
function useFeed(userId: number, publicKey: string, channelId: string, token?: string) {
  const [state, setState] = useState<{ status: number; body: any } | null>(null);
  const headers = {
    Authorization: `Bearer ${publicKey}`,
    "X-Knock-User-Token": token ?? "",
    "Content-Type": "application/json",
  };
  const load = useCallback(async () => {
    const r = await fetch(`${API}/users/${userId}/feeds/${channelId}?page_size=20`, { headers });
    setState({ status: r.status, body: await r.json().catch(() => null) });
  }, [userId, token]);
  const mark = async (status: "read" | "seen" | "unread", ids: string[]) => {
    await fetch(`${API}/messages/batch/${status}`, {
      method: "POST", headers, body: JSON.stringify({ message_ids: ids }),
    });
    await load();
  };
  useEffect(() => { if (token) load(); }, [load, token]);
  return { state, load, mark, headers };
}

function Check({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border p-4 space-y-3">
      <h2 className="font-semibold">Check {n}: {title}</h2>
      {children}
    </section>
  );
}

const Json = ({ v }: { v: unknown }) => (
  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(v, null, 2)}</pre>
);

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { user, token, feed, prefs, questions, instructors, otherUserId } = loaderData;
  const actionData = useActionData<typeof action>();
  const tok = token.ok ? token.value : undefined;
  const { state, load, mark, headers } = useFeed(user.id, feed.publicKey, feed.channelId, tok);
  const [forge, setForge] = useState<string | null>(null);
  const items: any[] = state?.body?.entries ?? [];
  const claims = tok ? JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) : null;
  const header = tok ? JSON.parse(atob(tok.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))) : null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <p className="text-sm bg-yellow-100 text-yellow-900 p-2 rounded">
        PROTOTYPE: Knock spike. Throwaway; not production code.
      </p>
      <h1 className="text-xl font-bold">Signed in as {user.name} (#{user.id}, {user.role})</h1>

      {actionData && (
        <div className="text-sm"><strong>Last action: {actionData.intent}</strong><Json v={actionData.result} /></div>
      )}

      <Check n={1} title="Signed user token per DevUI user">
        {token.ok ? (
          <>
            <div className="text-sm">alg <code>{header?.alg}</code>, sub <code>{claims?.sub}</code>, exp {new Date(claims?.exp * 1000).toLocaleTimeString()}</div>
            <div className="text-sm">Feed call status: <strong>{state?.status ?? "…"}</strong> (switch users in the DevUI: sub and feed should change)</div>
            {otherUserId && (
              <div className="text-sm space-x-2">
                <button className="underline" onClick={async () => {
                  const r = await fetch(`${API}/users/${otherUserId}/feeds/${feed.channelId}`, { headers });
                  setForge(`${r.status} ${JSON.stringify(await r.json().catch(() => null))}`);
                }}>Try reading user #{otherUserId}'s feed with my token</button>
                {forge && <span>→ <code>{forge}</code> (expect 401/403)</span>}
              </div>
            )}
          </>
        ) : <Json v={token} />}
      </Check>

      <Check n={2} title="Trigger Discussion Reply → question author (Node SDK)">
        {questions.length === 0 ? <p className="text-sm">No questions by other users. Switch user.</p> : (
          <Form method="post" className="space-y-2 text-sm">
            <input type="hidden" name="intent" value="reply" />
            <select name="questionId" className="border rounded p-1 w-full">
              {questions.map((q) => (
                <option key={q.id} value={q.id}>{q.authorName}: “{q.body.slice(0, 60)}” ({q.lessonTitle})</option>
              ))}
            </select>
            <input name="body" placeholder="Reply text" className="border rounded p-1 w-full" />
            <button className="border rounded px-3 py-1">Trigger</button>
            <p>Then switch the DevUI to the question's author: the item should appear in their feed below.</p>
          </Form>
        )}
      </Check>

      <Check n={3} title="Headless feed API: list, unread count, mark read/seen">
        <div className="text-sm space-x-3">
          <span>unread <strong>{state?.body?.meta?.unread_count ?? "?"}</strong></span>
          <span>unseen <strong>{state?.body?.meta?.unseen_count ?? "?"}</strong></span>
          <button className="underline" onClick={load}>Refresh</button>
          <button className="underline" onClick={() => mark("seen", items.map((i) => i.id))}>Mark all seen</button>
        </div>
        <ul className="text-sm divide-y">
          {items.map((i) => (
            <li key={i.id} className="py-2 flex justify-between gap-2">
              <span className={i.read_at ? "" : "font-semibold"}>
                [{i.source?.key}] {i.blocks?.[0]?.rendered?.replace(/<[^>]+>/g, "") ?? JSON.stringify(i.data)}
                <span className="text-muted-foreground"> {i.seen_at ? "seen" : "unseen"} / {i.read_at ? "read" : "unread"}</span>
              </span>
              <span className="space-x-2 shrink-0">
                <button className="underline" onClick={() => mark(i.read_at ? "unread" : "read", [i.id])}>
                  mark {i.read_at ? "unread" : "read"}
                </button>
              </span>
            </li>
          ))}
          {items.length === 0 && <li className="py-2 text-muted-foreground">Feed is empty.</li>}
        </ul>
        <details><summary className="text-xs">Raw feed response</summary><Json v={state} /></details>
      </Check>

      <Check n={4} title="Preferences: new Enrollment → Instructor is off by default, opt-in">
        <div className="text-sm space-y-2">
          <p>As an Instructor: Reset, then have a Student trigger an Enrollment to you. Nothing should arrive. Opt in, trigger again, and it should arrive.</p>
          <div className="flex gap-2">
            {(["opt-in", "opt-out", "reset-prefs"] as const).map((i) => (
              <Form method="post" key={i}><input type="hidden" name="intent" value={i} />
                <button className="border rounded px-3 py-1">{i}</button></Form>
            ))}
          </div>
          <Form method="post" className="flex gap-2">
            <input type="hidden" name="intent" value="enroll" />
            <select name="instructorId" className="border rounded p-1">
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <button className="border rounded px-3 py-1">Trigger new Enrollment (me as the Student)</button>
          </Form>
          <p>My preference set (server-side):</p>
          <Json v={prefs} />
        </div>
      </Check>
    </div>
  );
}

import { Knock, signUserToken } from "@knocklabs/node";
const E = process.env, k = new Knock({ apiKey: E.KNOCK_SECRET_API_KEY }), API = "https://api.knock.app/v1";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const tok = (id) => signUserToken(String(id), { signingKey: E.KNOCK_SIGNING_KEY, expiresInSeconds: 600 });
const h = (t) => ({ Authorization: `Bearer ${E.KNOCK_PUBLIC_API_KEY}`, "X-Knock-User-Token": t, "Content-Type": "application/json" });
const feed = async (asId, ofId = asId, t) => { const r = await fetch(`${API}/users/${ofId}/feeds/${E.KNOCK_FEED_CHANNEL_ID}`, { headers: h(t ?? await tok(asId)) }); return { status: r.status, body: await r.json() }; };
const pollFor = async (id, pred, tries = 12) => { for (let i = 0; i < tries; i++) { const f = await feed(id); if (pred(f.body.entries || [])) return f; await wait(1500); } return feed(id); };
const SARAH = { id: "2", name: "Sarah Chen", email: "sarah@example.com" }, EMMA = { id: "5", name: "Emma Wilson", email: "emma@example.com" }, MARCUS = { id: "3", name: "Marcus Johnson", email: "marcus@example.com" };
for (const u of [SARAH, EMMA, MARCUS]) await k.users.update(u.id, { name: u.name });

console.log("== CHECK 1: signed tokens");
const tS = await tok(2); console.log("header", Buffer.from(tS.split(".")[0], "base64url").toString(), "claims", Buffer.from(tS.split(".")[1], "base64url").toString());
console.log("Sarah reads own feed:", (await feed(2)).status);
const forged = await feed(2, 5, tS); console.log("Sarah's token on Emma's feed:", forged.status, JSON.stringify(forged.body).slice(0, 150));
console.log("No token:", (await feed(2, 2, "")).status, " garbage token:", (await feed(2, 2, "x.y.z")).status);

console.log("== CHECK 2: trigger Discussion Reply Sarah -> Emma (question #1)");
const before = (await feed(5)).body.entries.length;
const run = await k.workflows.trigger("discussion-reply", { actor: SARAH, recipients: [EMMA], data: { reply_excerpt: "E2E probe reply", question_excerpt: "q1", lesson_title: "L", url: "/x" } });
console.log("run", run.workflow_run_id);
const fE = await pollFor(5, (es) => es.length > before);
console.log("Emma feed items", before, "->", fE.body.entries.length, "| newest:", fE.body.entries[0]?.source?.key, JSON.stringify(fE.body.entries[0]?.blocks?.[0]?.rendered ?? fE.body.entries[0]?.data).slice(0, 120));
console.log("Sarah's feed (should not contain it):", (await feed(2)).body.entries.filter(e => e.source?.key === "discussion-reply").length);

console.log("== CHECK 3: headless feed API");
const item = fE.body.entries[0]; console.log("meta before", JSON.stringify(fE.body.meta));
const tE = await tok(5);
for (const s of ["seen", "read"]) { const r = await fetch(`${API}/messages/batch/${s}`, { method: "POST", headers: h(tE), body: JSON.stringify({ message_ids: [item.id] }) }); console.log(`mark ${s} (client, user token):`, r.status); }
const after = await feed(5); console.log("meta after", JSON.stringify(after.body.meta), "item read_at set:", !!after.body.entries.find(e => e.id === item.id)?.read_at);
const xr = await fetch(`${API}/messages/batch/unread`, { method: "POST", headers: h(tS), body: JSON.stringify({ message_ids: [item.id] }) }); console.log("Sarah marking Emma's item unread:", xr.status, (await xr.text()).slice(0, 150));

console.log("== CHECK 4: new Enrollment -> Marcus, off by default");
try { await k.users.unsetPreferences("3", "default"); } catch {}
const c0 = (await feed(3)).body.entries.filter(e => e.source?.key === "new-enrollment").length;
await k.workflows.trigger("new-enrollment", { actor: EMMA, recipients: [MARCUS], data: { student_name: "Emma", course_title: "E2E" } });
await wait(8000);
const c1 = (await feed(3)).body.entries.filter(e => e.source?.key === "new-enrollment").length;
console.log("no prefs set: enrollment items", c0, "->", c1, c1 === c0 ? "(suppressed ✔)" : "(DELIVERED ✘)");
await k.users.setPreferences("3", "default", { __persistence_strategy__: "merge", categories: { "new-enrollment": true } });
await k.workflows.trigger("new-enrollment", { actor: EMMA, recipients: [MARCUS], data: { student_name: "Emma", course_title: "E2E" } });
const f3 = await pollFor(3, (es) => es.filter(e => e.source?.key === "new-enrollment").length > c1);
const c2 = f3.body.entries.filter(e => e.source?.key === "new-enrollment").length;
console.log("after opt-in: enrollment items", c1, "->", c2, c2 > c1 ? "(delivered ✔)" : "(NOT delivered ✘)");
console.log("Marcus prefs:", JSON.stringify(await k.users.getPreferences("3", "default")).slice(0, 300));
const pr = await fetch(`${API}/users/3/preferences/default`, { headers: h(await tok(3)) }); console.log("Marcus reads own prefs client-side:", pr.status);
await k.users.unsetPreferences("3", "default");

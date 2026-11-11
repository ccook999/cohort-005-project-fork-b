import { Knock, signUserToken } from "@knocklabs/node";
const E = process.env, k = new Knock({ apiKey: E.KNOCK_SECRET_API_KEY });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const count = async (id) => { const t = await signUserToken(id, { signingKey: E.KNOCK_SIGNING_KEY, expiresInSeconds: 60 }); const r = await fetch(`https://api.knock.app/v1/users/${id}/feeds/${E.KNOCK_FEED_CHANNEL_ID}`, { headers: { Authorization: `Bearer ${E.KNOCK_PUBLIC_API_KEY}`, "X-Knock-User-Token": t } }); return (await r.json()).entries.filter(e => e.source?.key === "new-enrollment").length; };
const EMMA = { id: "5", name: "Emma Wilson" }, PRIYA = { id: "4", name: "Priya Nair" }, MARCUS = { id: "3", name: "Marcus Johnson" };
const trig = (to) => k.workflows.trigger("new-enrollment", { actor: EMMA, recipients: [to], data: { student_name: "Emma", course_title: "E2E" } });
// A: Marcus, explicit set cleared. B: Priya, a user who has never had a preference set (404).
try { await k.users.unsetPreferences("3", "default"); } catch {}
const m0 = await count("3"), p0 = await count("4");
await trig(MARCUS); await trig(PRIYA); await wait(10000);
const m1 = await count("3"), p1 = await count("4");
console.log("default only  Marcus", m0, "->", m1, m1 === m0 ? "suppressed ✔" : "DELIVERED ✘", "| Priya (never had prefs)", p0, "->", p1, p1 === p0 ? "suppressed ✔" : "DELIVERED ✘");
await k.users.setPreferences("3", "default", { __persistence_strategy__: "merge", categories: { "new-enrollment": true } });
await trig(MARCUS);
let m2 = m1; for (let i = 0; i < 10 && m2 === m1; i++) { await wait(1500); m2 = await count("3"); }
console.log("Marcus opts in", m1, "->", m2, m2 > m1 ? "delivered ✔" : "NOT delivered ✘");
await k.users.setPreferences("3", "default", { __persistence_strategy__: "merge", categories: { "new-enrollment": false } });
await trig(MARCUS); await wait(10000);
const m3 = await count("3"); console.log("Marcus opts back out", m2, "->", m3, m3 === m2 ? "suppressed ✔" : "DELIVERED ✘");
// discussion-reply must be unaffected by the default
const d0 = (await k.workflows.trigger("discussion-reply", { actor: EMMA, recipients: [MARCUS], data: { reply_excerpt: "still on?" } })).workflow_run_id;
await wait(6000); const t = await signUserToken("3", { signingKey: E.KNOCK_SIGNING_KEY, expiresInSeconds: 60 });
const r = await fetch(`https://api.knock.app/v1/users/3/feeds/${E.KNOCK_FEED_CHANNEL_ID}`, { headers: { Authorization: `Bearer ${E.KNOCK_PUBLIC_API_KEY}`, "X-Knock-User-Token": t } });
console.log("discussion-reply still reaches Marcus (default on):", (await r.json()).entries.some(e => e.source?.key === "discussion-reply") ? "✔" : "✘");
await k.users.unsetPreferences("3", "default");

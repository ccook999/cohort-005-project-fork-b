# PROTOTYPE: Knock spike evidence (never merge)

Scripts that ran the four checks for "Does Knock hold up against Cadence?" (#35)
as real seeded Cadence users, calling the feed the way the browser does
(public key + server-signed user token).

    node --env-file=.env scripts/prototype-knock/e2e.mjs     # checks 1–4 (first pass)
    node --env-file=.env scripts/prototype-knock/check4.mjs  # check 4 rerun after dashboard setup
    node --env-file=.env scripts/prototype-knock/check4b.mjs # workflow-level opt-out probe

The interactive version is the /prototype/knock route (`npm run dev`).

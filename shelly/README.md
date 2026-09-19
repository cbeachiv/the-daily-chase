# 3720 Center St laundry status

Two **Shelly Plug US Gen4** smart plugs (one per machine) measure power draw and
post to this site. The public page at **www.3720centerstreet.com** shows whether
the washer and dryer are in use, and Twilio texts a fixed list when a cycle ends.

```
Shelly plug (washer) ─┐  script: HTTPS POST
Shelly plug (dryer)  ─┴─▶ POST /api/laundry/report ─▶ Firestore laundry/status
phone ─▶ 3720centerstreet.com/ (rewrite → /laundry) ─polls─▶ GET /api/laundry/status
```

Code: `lib/laundry.ts` (state + "in use" logic), `lib/laundryServer.ts`,
`lib/sms.ts`, `app/api/laundry/*`, `app/laundry/page.tsx`,
`components/LaundryStatus.tsx`, `shelly/laundry-report.js` (runs on the plug).

## 1. Site setup (once)

1. Register `3720centerstreet.com` (Vercel Domains is easiest — DNS is automatic).
   In the Vercel project → **Domains**, add both `3720centerstreet.com` and
   `www.3720centerstreet.com`, and set the apex to redirect to `www`.
2. Generate the plug secret and add env vars to production:
   ```bash
   openssl rand -hex 32
   ```
   ```bash
   npx vercel env add LAUNDRY_SECRET production
   ```
   Repeat for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`,
   `LAUNDRY_SMS_TO` (see `.env.example`). **Do not** run
   `scripts/set-vercel-env.mjs` for these — it regenerates `CRON_SECRET`.
3. Redeploy. `https://www.3720centerstreet.com/api/laundry/status` should return
   JSON with both machines free/offline.

## 2. Twilio (for "done" texts)

1. Create a Twilio account and buy a **toll-free** number (a local number needs
   A2P 10DLC business registration; toll-free only needs a verification form).
2. Submit toll-free verification (Messaging → Compliance). Until approved, texts
   are blocked in the US.
3. Copy the Account SID, Auth Token, and number into the env vars above.
   `LAUNDRY_SMS_TO` is a comma-separated list of E.164 numbers.

Leave the Twilio vars blank to run without SMS — the site logs what it would
have sent.

## 3. Plug setup (per plug)

1. Plug the Shelly into the wall outlet, then the machine's cord into the Shelly.
   Both machines are 120 V / NEMA 5-15; the plug is rated 15 A / 1800 W.
2. Shelly app → add device → join the basement 2.4 GHz Wi-Fi. Update firmware.
   Name them `Washer plug` / `Dryer plug`.
3. Settings to check in the app (or the plug's local web UI at its IP):
   - **Output: on. Auto-off: disabled. Power-on default: on** — a power blip must
     never leave the machine dead.
   - LED: dim or off.
   - If there is a button lock / input disable option, turn it on so nobody
     switches the machine off by pressing the plug. Otherwise label it.
   - If **Scripts** is greyed out, disable Matter (and Zigbee) on the device;
     scripting is gated behind that on some Shelly models.
4. Sanity-check the power graph over a cycle: idle < 3 W; washer running > 50 W;
   dryer (gas) running > 100 W.
5. Scripts → **Add script** → paste `shelly/laundry-report.js`. Edit the top:
   - `MACHINE = "washer"` or `"dryer"`
   - `SECRET` = the `LAUNDRY_SECRET` value
   - `ON_WATTS`: 8 for the washer, 15 for the dryer
   Save, **Start**, and enable **Run on startup**. The script console should
   print `laundry: washer idle 0.8W sent` within a few seconds.
6. Test: start a short cycle (or plug a lamp in and switch it on). The site
   should flip to **In use** within ~10 s and back to **Free** about 3 min after
   power drops.

## 4. Tuning (no deploy needed)

Create `laundry/config` in the Firebase console to override defaults (ms):

| field       | default | meaning                                                 |
|-------------|---------|---------------------------------------------------------|
| `graceMs`   | 120000  | keep "in use" this long after the last running report    |
| `offlineMs` | 720000  | plug shown offline after this long without a report     |
| `minRunMs`  | 300000  | runs shorter than this never trigger a text             |

Every start/stop is logged to the `laundryEvents` collection (machine, running,
watts, at). If a machine flaps mid-cycle, raise the plug's `OFF_DEBOUNCE_MS` or
the server's `graceMs`; if a brief jostle shows as a run, raise `ON_WATTS`.

## How "done" texts work

The plug reports `running:false` after 60 s of low power, then reports again
150 s later. On that second report the server sees the machine still idle past
the grace window, the run lasted ≥ `minRunMs`, and no text has gone out for this
run — so it sends one text per cycle, about 2–3 minutes after the machine stops.
The 5-minute heartbeat is the backstop if that report is lost.

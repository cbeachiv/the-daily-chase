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
     never leave the machine dead. (Shelly shipped these with `initial_state:
     "off"`, which is exactly what killed the dryer on 2026-09-20/21.)
   - LED: off.
   - Button **detached** so nobody can cut the machine's power by pressing the
     plug. Both can be set over the LAN without the app:
     ```bash
     curl -X POST http://<plug-ip>/rpc/Switch.SetConfig -d '{"id":0,"config":{"initial_state":"on","auto_off":false,"autorecover_voltage_errors":true}}'
     curl -X POST http://<plug-ip>/rpc/PLUGS_UI.SetConfig -d '{"config":{"controls":{"switch:0":{"in_mode":"detached"}}}}'
     ```
   - The script also runs a watchdog: if the relay is ever off for a reason
     other than a protection trip (overtemp/overpower/overcurrent/voltage), it
     turns it back on and the site logs a `power_off`/`power_restored` event
     with Shelly's `source` (button, HTTP_in, init, ...).
   - If **Scripts** is greyed out, disable Matter (and Zigbee) on the device;
     scripting is gated behind that on some Shelly models.
4. Sanity-check the power graph over a cycle: idle < 3 W; washer running > 50 W;
   dryer (gas) running > 100 W. The washer has three low levels: about 0.7 W
   fully off, 1.3 to 1.4 W just after a load finishes, and 2.0 to 2.3 W while
   paused mid-load (the ~9 min quiet stretch early in a load, plus short pauses
   between phases). `OFF_WATTS` has to sit between the last two.
5. Scripts → **Add script** → paste `shelly/laundry-report.js`. Edit the top:
   - `MACHINE = "washer"` or `"dryer"`
   - `SECRET` = the `LAUNDRY_SECRET` value
   - `ON_WATTS`: 8 for the washer, 15 for the dryer
   - `OFF_WATTS`: 1.7 for the washer, 3 for the dryer
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

Every start/stop is logged to the `laundryEvents` collection (machine, kind,
watts, at), along with `power_off` / `power_restored` events and their cause.
Plugs answer local RPC at `http://<ip>/rpc/Switch.GetStatus?id=0`; the `source`
field says what last changed the relay, and `Sys.GetStatus` gives `uptime` and
`reset_reason` (1 = lost power). `node scripts/laundry-events.mjs --days 3`
(from the main checkout) prints the log with the watts at each stop and the gap
to the next start. If a machine flaps mid-cycle, look at those stop watts first:
if the pauses read just under `OFF_WATTS` and real ends read lower, lower
`OFF_WATTS` between them (that is how the washer got 1.7 W on 2026-09-23). Only
then raise the plug's `OFF_DEBOUNCE_MS` or the server's `graceMs`. If a brief
jostle shows as a run, raise `ON_WATTS`.

Maintenance over the LAN (plugs are `192.168.1.151` washer / `.152` dryer):
- Script update: `Script.Stop {id:1}`, `Script.PutCode` with a ~40-byte first
  chunk (`append:false`; large non-append payloads are rejected), then
  ~1200-byte chunks with `append:true`, then `Script.Start`. Use curl with
  `--data-binary @file`, and keep the script ASCII-only.
- Firmware: `POST /rpc/Shelly.Update -d '{"stage":"stable"}'` returns null,
  downloads for a minute or two, then reboots. Config and scripts survive; do it
  while the machine is idle (the relay drops during the reboot). Both plugs
  went 1.7.99 -> 2.0.0 this way on 2026-09-22.

## How "done" texts work

The plug reports `running:false` after 60 s of low power, then reports again
150 s later. On that second report the server sees the machine still idle past
the grace window, the run lasted ≥ `minRunMs`, and no text has gone out for this
run — so it sends one text per cycle, about 2–3 minutes after the machine stops.
The 5-minute heartbeat is the backstop if that report is lost.

## Weekly email

Every Sunday at 9 AM Eastern, `app/api/cron/laundry-weekly` emails "The Laundry
Report" (last 7 days: loads, run times, busiest slots, quietest windows for the
coming week, washer-to-dryer waits, records, trends) to `LAUNDRY_EMAIL_TO`
(defaults to Chase and Sarah). It sends from `LAUNDRY_FROM`, or `laundry@` on
the domain in `ADVISOR_FROM`. Stats come from `lib/laundryStats.ts`, which
rebuilds loads from `laundryEvents` and merges the pre-2026-09-23 washer pauses.

- Preview with real data, no send (from the main checkout):
  `npx tsx scripts/preview-laundry-email.ts --today 2026-09-27`
- Test send to one address:
  `curl -H "Authorization: Bearer $CRON_SECRET" "https://thedailychase.com/api/cron/laundry-weekly?to=you@example.com"`

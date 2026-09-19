// laundry-report.js — runs ON the Shelly Plug US Gen4 (Scripts → Add script).
// Watches the plug's power meter and tells www.3720centerstreet.com when the
// machine starts or stops. One copy per plug; only MACHINE differs.
//
// Shelly scripts are mJS: use `let` + `function`, no arrow functions/classes.

let MACHINE = "washer";                 // "washer" or "dryer"
let URL = "https://www.3720centerstreet.com/api/laundry/report";
let SECRET = "PASTE_LAUNDRY_SECRET_HERE"; // same value as LAUNDRY_SECRET in Vercel

let ON_WATTS = 8;          // above this = running   (washer 8, dryer 15)
let OFF_WATTS = 3;         // below this = idle      (both machines idle < 3 W)
let ON_DEBOUNCE_MS = 5000;     // power must stay up this long before "running"
let OFF_DEBOUNCE_MS = 60000;   // power must stay down this long before "idle"
let POST_STOP_MS = 150000;     // extra "still idle" report so the site can text "done"
let HEARTBEAT_MS = 300000;     // periodic report so the site knows the plug is alive

let running = false;
let watts = 0;
let debounceTimer = null;
let retryTimer = null;

function readWatts() {
  let st = Shelly.getComponentStatus("switch:0");
  return st && typeof st.apower === "number" ? st.apower : 0;
}

function send() {
  watts = readWatts();
  let body = JSON.stringify({ machine: MACHINE, running: running, watts: watts });
  Shelly.call(
    "HTTP.Request",
    {
      method: "POST",
      url: URL,
      headers: { "Authorization": "Bearer " + SECRET, "Content-Type": "application/json" },
      body: body,
      timeout: 10
    },
    function (res, errCode, errMsg) {
      let ok = errCode === 0 && res && res.code >= 200 && res.code < 300;
      print("laundry:", MACHINE, running ? "running" : "idle", watts + "W", ok ? "sent" : "FAILED " + (res ? res.code : errMsg));
      if (!ok && retryTimer === null) {
        retryTimer = Timer.set(15000, false, function () {
          retryTimer = null;
          send();
        });
      }
    }
  );
}

function setRunning(next) {
  if (next === running) return;
  running = next;
  send();
  if (!running) Timer.set(POST_STOP_MS, false, send);
}

function wanted(p) {
  // Hysteresis: once running, stay running until power drops below OFF_WATTS.
  return running ? p > OFF_WATTS : p >= ON_WATTS;
}

function onPower(p) {
  watts = p;
  let want = wanted(p);
  if (want === running) {
    if (debounceTimer !== null) {
      Timer.clear(debounceTimer);
      debounceTimer = null;
    }
    return;
  }
  if (debounceTimer !== null) return; // already counting down
  debounceTimer = Timer.set(want ? ON_DEBOUNCE_MS : OFF_DEBOUNCE_MS, false, function () {
    debounceTimer = null;
    let p2 = readWatts();
    watts = p2;
    let w2 = wanted(p2);
    if (w2 !== running) setRunning(w2);
  });
}

Shelly.addStatusHandler(function (ev) {
  if (ev.component === "switch:0" && ev.delta && typeof ev.delta.apower === "number") {
    onPower(ev.delta.apower);
  }
});

// Boot: report current state, then heartbeat.
onPower(readWatts());
send();
Timer.set(HEARTBEAT_MS, true, send);

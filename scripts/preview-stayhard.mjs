// Renders a faithful "Stay Hard" email preview using the SAME builder the cron
// route uses, with sample data. Run: node scripts/preview-stayhard.mjs
// Writes preview-stayhard.html next to it. (Node 24 strips the .ts types on import.)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildEmailHtml } from "../app/api/cron/stay-hard/email.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Illustrative — the real send pulls today's logs from Firestore. Set
// TRAINED=0 to preview the "no zero days yet" (not-trained) variant.
const trained = process.env.TRAINED !== "0";

const message = trained
  ? [
      "You lifted today. Good. Now wipe that smile off — that was the EASY part.",
      "It's 4:15. You're walking in that door starving, and this is where you've folded every single night this week.",
      "Not today. The dinner is already decided. You don't get a vote when you're weak and hungry — the strong version of you already made the call this morning.",
      "Eat the plan. Close the loops. Then look in the mirror and know you didn't blink. Stay hard.",
    ].join("\n")
  : [
      "It's 4:15 and you haven't moved. So what. The day isn't dead — but it's bleeding out, and only you can stop it.",
      "Get the work in. No zero days. Then walk in that door hungry and eat the plan you already locked.",
      "The hunger is the test. It's supposed to suck. Don't you dare negotiate with it. Stay hard.",
    ].join("\n");

const data = {
  prettyDate: "Monday, June 15",
  message,
  trainedToday: trained,
  caloriesSoFar: trained ? 1180 : null,
  liftsLogged: trained ? 1 : 0,
  dinner: "160g frozen mango, 160g frozen blueberry, 260g Fage, 4 graham crackers",
  goals: [
    "Work out EVERY day — no zero days.",
    "Progressive overload — beat last session's lift, even by one rep.",
    "Stick to the nutrition plan — especially dinner.",
  ],
};

const html = buildEmailHtml(data);
const out = join(__dirname, "preview-stayhard.html");
writeFileSync(out, html);
console.log(out);

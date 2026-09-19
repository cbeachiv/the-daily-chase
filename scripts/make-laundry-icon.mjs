// Generates the 3720 Center St laundry icons: a front-loader porthole with
// sloshing water and bubbles on a sky→teal gradient. Run: node scripts/make-laundry-icon.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Porthole artwork in a 100x100 box (no background) so it can be reused on the OG image.
function porthole(x = 0, y = 0, s = 1) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <!-- machine face: control knobs -->
    <circle cx="20" cy="17" r="4.2" fill="#ffffff" opacity="0.9"/>
    <circle cx="33" cy="17" r="4.2" fill="#ffffff" opacity="0.9"/>
    <rect x="46" y="14" width="34" height="6" rx="3" fill="#ffffff" opacity="0.55"/>
    <!-- door ring -->
    <circle cx="50" cy="58" r="33" fill="#ffffff"/>
    <circle cx="50" cy="58" r="27.5" fill="#0b4f5c"/>
    <!-- water: clip to the glass, tilted so it reads as mid-spin -->
    <clipPath id="glass"><circle cx="50" cy="58" r="27.5"/></clipPath>
    <g clip-path="url(#glass)">
      <path fill="#14b8a6" d="M18 66 C28 58, 36 74, 46 66 S64 58, 74 66 S84 74, 92 66 L92 100 L18 100 Z"/>
      <path fill="#5eead4" opacity="0.75" d="M18 74 C28 68, 36 80, 46 74 S64 68, 74 74 S84 80, 92 74 L92 100 L18 100 Z"/>
      <!-- bubbles -->
      <circle cx="37" cy="49" r="3.4" fill="#ffffff" opacity="0.95"/>
      <circle cx="58" cy="42" r="2.4" fill="#ffffff" opacity="0.9"/>
      <circle cx="64" cy="53" r="4.4" fill="#ffffff" opacity="0.85"/>
      <circle cx="47" cy="40" r="1.6" fill="#ffffff" opacity="0.8"/>
      <!-- the lone sock, mid-tumble -->
      <g transform="translate(60 60) rotate(-40)">
        <path fill="#fbbf24" d="M-3.6 -11 h7.2 v12 a3.6 3.6 0 0 0 3.6 3.6 h3.2 a3.8 3.8 0 0 1 0 7.6 h-10.4 a3.6 3.6 0 0 1 -3.6 -3.6 Z"/>
        <rect x="-3.6" y="-11" width="7.2" height="3.2" fill="#fef3c7"/>
      </g>
    </g>
    <!-- glass highlight -->
    <path fill="#ffffff" opacity="0.28" d="M30 45 a24 24 0 0 1 22 -14 a3 3 0 0 1 0 6 a18 18 0 0 0 -16 10 a3 3 0 0 1 -6 -2 Z"/>
  </g>`;
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#14b8a6"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  ${porthole(0, 0, 1)}
</svg>`;

// 1200x630 link-preview card (iMessage, Slack, etc.)
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#14b8a6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${porthole(110, 95, 4.4)}
  <g font-family="-apple-system, Helvetica Neue, Helvetica, Arial, sans-serif" fill="#ffffff">
    <text x="600" y="255" font-size="44" font-weight="600" opacity="0.85" letter-spacing="6">3720 CENTER ST</text>
    <text x="600" y="360" font-size="110" font-weight="800" letter-spacing="-2">Laundry</text>
    <text x="600" y="430" font-size="38" opacity="0.9">Is the washer or dryer free?</text>
  </g>
</svg>`;

writeFileSync(new URL("./laundry-icon-source.svg", import.meta.url), icon);
const out = new URL("../public/", import.meta.url);
for (const size of [32, 180, 192, 512]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(fileURLToPath(new URL(`laundry-icon-${size}.png`, out)));
}
await sharp(Buffer.from(og)).resize(1200, 630).png().toFile(fileURLToPath(new URL("laundry-og.png", out)));
console.log("done");

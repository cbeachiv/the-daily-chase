import type { WxKind } from "@/lib/weather/nws";

// Thin-line weather glyphs that match the report's warm, quiet look.
export default function WxIcon({
  kind,
  isDay = true,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.6,
}: {
  kind: WxKind;
  isDay?: boolean;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const sun = (cx: number, cy: number, r: number) => (
    <g>
      <circle cx={cx} cy={cy} r={r} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const r1 = r + 2.6, r2 = r + 4.8;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r1}
            y1={cy + Math.sin(a) * r1}
            x2={cx + Math.cos(a) * r2}
            y2={cy + Math.sin(a) * r2}
          />
        );
      })}
    </g>
  );
  const moon = (cx: number, cy: number) => (
    <path d={`M${cx + 4.5} ${cy + 2.5}A6 6 0 1 1 ${cx - 1.5} ${cy - 5.5}a4.6 4.6 0 0 0 6 8z`} />
  );
  const cloud = "M7 18.5h9.5a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 6.4 12a3.3 3.3 0 0 0 .6 6.5z";

  let body: React.ReactNode;
  switch (kind) {
    case "clear":
      body = isDay ? sun(12, 12, 4) : moon(12, 12);
      break;
    case "partly":
      body = (
        <>
          {isDay ? sun(9, 8.5, 2.8) : <g transform="translate(-3 -3.5) scale(.8)">{moon(12, 12)}</g>}
          <path d="M9 20h8a3.2 3.2 0 0 0 .3-6.4A4.6 4.6 0 0 0 8.6 14.6a2.8 2.8 0 0 0 .4 5.4z" />
        </>
      );
      break;
    case "cloudy":
      body = <path d={cloud} />;
      break;
    case "rain":
      body = (
        <>
          <path d="M7 15h9.5a3.6 3.6 0 0 0 .4-7.2A5.3 5.3 0 0 0 6.6 8.8a3.1 3.1 0 0 0 .4 6.2z" />
          <path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" />
        </>
      );
      break;
    case "storm":
      body = (
        <>
          <path d="M7 15h9.5a3.6 3.6 0 0 0 .4-7.2A5.3 5.3 0 0 0 6.6 8.8a3.1 3.1 0 0 0 .4 6.2z" />
          <path d="M12.5 15.5l-2 3.5h3l-2 3.5" />
        </>
      );
      break;
    case "snow":
      body = (
        <>
          <path d="M7 15h9.5a3.6 3.6 0 0 0 .4-7.2A5.3 5.3 0 0 0 6.6 8.8a3.1 3.1 0 0 0 .4 6.2z" />
          <path d="M8.5 19h.01M12 20.5h.01M15.5 19h.01" strokeWidth={strokeWidth * 1.8} />
        </>
      );
      break;
    case "fog":
      body = <path d="M4 9h16M6 13h12M4 17h16" />;
      break;
    case "wind":
      body = <path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 14h15a2.5 2.5 0 1 1-2.5 2.5M3 19h7" />;
      break;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {body}
    </svg>
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // legacy/ holds the old static site for reference; keep it out of the build.
  outputFileTracingExcludes: {
    "*": ["./legacy/**"],
  },
  // 3720centerstreet.com is a second domain on this Vercel project that serves
  // only the public laundry-status page. `beforeFiles` is required because `/`
  // is a real route file (app/page.tsx redirects to /today on the main domain).
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "(www\\.)?3720centerstreet\\.com" }],
          destination: "/laundry",
        },
      ],
    };
  },
};

export default nextConfig;

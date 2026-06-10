/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // legacy/ holds the old static site for reference; keep it out of the build.
  outputFileTracingExcludes: {
    "*": ["./legacy/**"],
  },
};

export default nextConfig;

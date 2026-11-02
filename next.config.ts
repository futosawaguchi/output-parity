import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agent instructions for this repo live in CLAUDE.md; don't generate AGENTS.md.
  agentRules: false,
  // Keep the Next.js badge out of demo recordings.
  devIndicators: false,
  // pdfjs loads its worker and CMaps from its own package directory; bundling breaks that.
  serverExternalPackages: ["pdfjs-dist"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

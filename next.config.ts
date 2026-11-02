import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agent instructions for this repo live in CLAUDE.md; don't generate AGENTS.md.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

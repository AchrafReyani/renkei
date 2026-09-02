import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md / CLAUDE.md into the project on `next dev`; keep the example clean.
  agentRules: false,
};

export default nextConfig;

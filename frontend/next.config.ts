import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Lets a second build (say, the `NEXT_PUBLIC_LEDGER=canton` one) land in its
   * own directory instead of clobbering a running server's `.next`.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',

  /**
   * `NEXT_OUTPUT=standalone` makes `next build` emit a self-contained server
   * under `.next/standalone`, so the Docker runtime image can ship the traced
   * subset of `node_modules` instead of the whole tree. Opt-in on purpose: an
   * unset variable leaves the native `npm run dev` / `npm run build` path
   * exactly as it was.
   */
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

export default nextConfig;

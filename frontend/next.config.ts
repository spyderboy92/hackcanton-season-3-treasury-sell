import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Lets a second build (say, the `NEXT_PUBLIC_LEDGER=canton` one) land in its
   * own directory instead of clobbering a running server's `.next`.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;

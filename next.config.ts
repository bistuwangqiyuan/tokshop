import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const key = process.env.INDEXNOW_KEY;
    if (!key) return [];
    // IndexNow protocol: the key file must sit at the site root to verify all URLs
    return [{ source: `/${key}.txt`, destination: `/indexnow/${key}.txt` }];
  },
};

export default nextConfig;

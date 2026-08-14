import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/b/:sector",
        destination: "/check/:sector",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

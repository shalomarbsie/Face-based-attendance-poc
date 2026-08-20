import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GATE_IN_URL = process.env.NEXT_PUBLIC_GATE_IN_URL ?? "http://localhost:8000";
const GATE_OUT_URL = process.env.NEXT_PUBLIC_GATE_OUT_URL ?? "http://localhost:8001";

const nextConfig: NextConfig = {
  devIndicators: false,
  
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      { 
        source: "/api/gate-in/:path*",
        destination: `${GATE_IN_URL}/:path*` 
      },
      { 
        source: "/api/gate-out/:path*", 
        destination: `${GATE_OUT_URL}/:path*` 
      },
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${API_URL}/ws/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
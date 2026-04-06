import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com",
            "connect-src 'self' https://*.firebaseapp.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
            "img-src 'self' data: blob:",
            "style-src 'self' 'unsafe-inline'",
            "frame-src https://*.firebaseapp.com",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;

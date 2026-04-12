import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // HSTS: enforce HTTPS for 1 year (Railway always serves TLS)
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com",
            "connect-src 'self' https://*.firebaseapp.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com",
            "img-src 'self' data: blob: https://firebasestorage.googleapis.com",
            "style-src 'self' 'unsafe-inline'",
            "frame-src https://*.firebaseapp.com",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;

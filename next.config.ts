import type { NextConfig } from "next";
import withPWA from 'next-pwa';

const isDev = process.env.NODE_ENV === 'development';

// CSP for development - more permissive
const devCSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "connect-src 'self' blob: data: https://cdn.jsdelivr.net https://api.mymemory.translated.net",
].join('; ');

// CSP for production - more restrictive
const prodCSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "connect-src 'self' blob: data: https://api.mymemory.translated.net",
].join('; ');

const config = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
})({
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: isDev ? devCSP : prodCSP
        }
      ]
    }
  ]
});

export default config;

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
  "connect-src 'self' blob: data: https://cdn.jsdelivr.net",
  "manifest-src 'self'"
].join('; ');

// CSP for production - more restrictive
const prodCSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "connect-src 'self' blob: data:",
  "manifest-src 'self'"
].join('; ');

const config = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: isDev,
  sw: '/workbox-config.js'
})({
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: isDev ? devCSP : prodCSP
        },
        {
          key: 'Service-Worker-Allowed',
          value: '/'
        }
      ]
    }
  ]
});

export default config;

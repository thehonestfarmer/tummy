/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "connect-src 'self'",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "frame-src 'self'"
            ].join('; ')
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=*, microphone=(), geolocation=*'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig; 
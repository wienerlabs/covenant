/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
    ],
  },
  eslint: {
    // Allow production builds to complete even with lint warnings
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        // Static media in /public — backgrounds, logo, video, fonts.
        // These are content-addressed via filename; when we need to change
        // an image we change the filename (e.g. poster-bg-v2.png) rather
        // than trying to bust an immutable cache.
        source: "/:file*.:ext(png|jpg|jpeg|webp|avif|mp4|webm|woff|woff2|svg|ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Next.js static chunks — already content-hashed, safe to cache hard
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

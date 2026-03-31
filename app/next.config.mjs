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
};

export default nextConfig;

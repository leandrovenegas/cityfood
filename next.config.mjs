/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    lightningCssFeatures: {
      include: ['colors'],
    },
  },
};

export default nextConfig;

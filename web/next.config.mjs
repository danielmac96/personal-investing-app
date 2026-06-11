/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // better-sqlite3 is a native addon — keep it out of the webpack bundle.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;

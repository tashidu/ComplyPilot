/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone with a self-contained server.js, so the ECS
  // instance does not need the full node_modules tree at runtime.
  output: "standalone",
};

export default nextConfig;

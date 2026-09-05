/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone with a self-contained server.js, so the ECS
  // instance does not need the full node_modules tree at runtime.
  output: "standalone",
  // Playwright drives a real browser and must not be bundled by webpack.
  serverExternalPackages: ["playwright"],
  // The dev overlay would otherwise appear in the agent's screenshots.
  devIndicators: false,
};

export default nextConfig;

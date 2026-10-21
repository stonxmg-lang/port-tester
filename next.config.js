/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API probe routes perform real outbound sockets and must never be
  // statically optimized or edge-bundled (Node 'net'/'dgram' required).
  experimental: {},
};

module.exports = nextConfig;

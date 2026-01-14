/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Esta linha impede que o Next.js tente rodar suas APIs durante o build
  output: 'standalone',
  experimental: {
    workerThreads: false,
    cpus: 1
  }
};

module.exports = nextConfig;

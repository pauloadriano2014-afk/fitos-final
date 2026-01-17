/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  
  // Otimizações do Render (MANTIDAS)
  output: 'standalone',
  experimental: {
    workerThreads: false,
    cpus: 1
  },

  // --- NOVA CONFIGURAÇÃO DE CORS (LIBERA O NAVEGADOR) ---
  async headers() {
    return [
      {
        // Aplica para todas as rotas da API
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" }, // <--- O PULO DO GATO
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

module.exports = nextConfig;
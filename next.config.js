/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  
  output: 'standalone',
  experimental: {
    workerThreads: false,
    cpus: 1,
    // 🔥 A BALA DE PRATA: PROÍBE O NEXT DE DESTRUIR O PDF-PARSE 🔥
    serverComponentsExternalPackages: ['pdf-parse'],
    serverActions: {
      allowedOrigins: [
        'pauloadrianoteam.com.br', 
        '*.pauloadrianoteam.com.br', 
        'fitos-final.onrender.com',
        'localhost:8081', 
        'localhost:3000'
      ],
    },
  },

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

module.exports = nextConfig;
import { NextResponse } from 'next/server';

export function middleware(request: Request) {
  // Se for uma requisição de verificação do navegador (Preflight/OPTIONS), aprovamos com 200 OK na hora.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
      },
    });
  }

  // Para as requisições normais (GET, POST, PUT, DELETE), deixamos passar e injetamos os headers.
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');

  return response;
}

// Isso garante que o segurança atue em TODAS as rotas da API
export const config = {
  matcher: '/api/:path*',
};
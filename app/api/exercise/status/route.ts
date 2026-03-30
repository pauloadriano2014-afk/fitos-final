// app/api/exercise/status/route.ts (NOVO ARQUIVO)
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const guid = searchParams.get('guid');

    if (!guid) {
      return NextResponse.json({ error: "GUID ausente" }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    // 🔥 Consulta o status bruto na Cloudflare
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${guid}`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
      }
    );

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error("Falha ao verificar status");
    }

    // Retorna se está "ready" ou "processing"
    const isReady = data.result.status.state === 'ready';
    return NextResponse.json({ success: true, isReady });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
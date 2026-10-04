// app/api/membros/produto/[produtoId]/aba/[abaId]/route.ts
// 📖 ÁREA DE MEMBROS — o conteúdo de uma aba de texto: guia, receitas ou diário de cargas (as instruções). Hábitos e medidas têm rota própria (levam dados da pessoa).
import { comAcesso, reply } from '@/lib/membrosRota';
import { conteudoDaAba } from '@/lib/membrosConteudo';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { produtoId: string; abaId: string } }) {
  return comAcesso(request, params?.produtoId, 'leitura', 'aba GET', async (a) => {
    const aba = a.abas.find((x) => x.id === String(params?.abaId ?? ''));
    if (!aba || !['guia', 'receitas', 'diario'].includes(aba.tipo)) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    const conteudo = conteudoDaAba(aba);
    if (!conteudo) return reply({ error: 'Conteúdo não encontrado.' }, 404);
    return reply({ aba: { id: aba.id, tipo: aba.tipo, titulo: aba.titulo }, conteudo, ...(a.previa ? { previa: true } : {}) });
  });
}

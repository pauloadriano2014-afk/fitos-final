// app/pagamento-recorrencia/layout.tsx
// Esse projeto não tem um app/layout.tsx na raiz — cada seção de páginas
// (ex: app/admin/layout.tsx) define o próprio layout local. As páginas de
// retorno do Checkout (sucesso/cancelado/expirado) foram criadas sem um
// layout.tsx nessa pasta, e como não existe nenhum layout acima delas na
// árvore, o Next não consegue montar a rota ("doesn't have a root
// layout"). Esse arquivo resolve isso — cada página já define seu próprio
// visual completo (fundo preto, etc.), então aqui é só um passthrough.
export default function PagamentoRecorrenciaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

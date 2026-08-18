// app/pagamento-recorrencia/sucesso/page.tsx
// Página simples pra onde a Asaas redireciona o navegador depois que o
// aluno termina de cadastrar o cartão no Checkout hospedado. A confirmação
// de verdade acontece via webhook (CHECKOUT_PAID) — essa página é só o
// "pode voltar pro app" visual pro aluno.

export default function PagamentoRecorrenciaSucesso() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        color: '#FFF',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: '#CCFF00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          marginBottom: 24,
        }}
      >
        ✓
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
        Cartão cadastrado com sucesso!
      </h1>
      <p style={{ color: '#999', fontSize: 15, maxWidth: 320, lineHeight: 1.5 }}>
        Sua mensalidade agora será cobrada automaticamente. Pode fechar essa
        página e voltar pro app.
      </p>
    </div>
  );
}

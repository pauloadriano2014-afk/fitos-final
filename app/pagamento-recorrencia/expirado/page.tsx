// app/pagamento-recorrencia/expirado/page.tsx
// Redirect da Asaas quando o link do Checkout expira (padrão: 60min) sem o
// aluno terminar de cadastrar o cartão.

export default function PagamentoRecorrenciaExpirado() {
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
          backgroundColor: '#333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          marginBottom: 24,
        }}
      >
        ⏱
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
        Esse link expirou
      </h1>
      <p style={{ color: '#999', fontSize: 15, maxWidth: 320, lineHeight: 1.5 }}>
        Volte pro app e ative a recorrência de novo pra gerar um novo link.
      </p>
    </div>
  );
}

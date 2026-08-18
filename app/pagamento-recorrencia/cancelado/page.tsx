// app/pagamento-recorrencia/cancelado/page.tsx
// Redirect da Asaas quando o aluno cancela/fecha o Checkout antes de terminar.

export default function PagamentoRecorrenciaCancelado() {
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
        ✕
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
        Cadastro cancelado
      </h1>
      <p style={{ color: '#999', fontSize: 15, maxWidth: 320, lineHeight: 1.5 }}>
        Nenhum cartão foi salvo. Você pode voltar pro app e tentar de novo
        quando quiser.
      </p>
    </div>
  );
}

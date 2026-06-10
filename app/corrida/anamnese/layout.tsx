// app/corrida/anamnese/layout.tsx
export default function RunningAnamneseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Anamnese de Corrida — Paulo Adriano Team</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0d0d0d' }}>
        {children}
      </body>
    </html>
  );
}
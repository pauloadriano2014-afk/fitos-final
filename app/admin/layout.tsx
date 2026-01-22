export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Aqui você pode por uma barra lateral ou menu no futuro */}
      <main>{children}</main>
    </div>
  )
}
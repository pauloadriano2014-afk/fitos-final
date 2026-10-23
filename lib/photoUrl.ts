// 📷 (23 out 2026) Regra do link da foto de perfil (usada em /api/user/update). Fica em lib porque rota do Next só pode exportar GET/POST/PUT...
/** O link da foto: texto https de até 500 letras e, quando o servidor sabe o endereço público do R2, só links dele. null ou vazio = tirar a foto. */
export function validPhotoUrl(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
    if (raw === null || raw === '') return { ok: true, value: null };
    if (typeof raw !== 'string') return { ok: false, error: "Link da foto inválido." };
    const url = raw.trim();
    if (url.length > 500 || !/^https:\/\//i.test(url)) return { ok: false, error: "Link da foto inválido." };
    const pub = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
    if (pub && !url.startsWith(pub + '/')) return { ok: false, error: "A foto precisa ser enviada pelo app." };
    return { ok: true, value: url };
}

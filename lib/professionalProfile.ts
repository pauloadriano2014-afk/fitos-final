// lib/professionalProfile.ts
// 🪪 (30 set 2026) Validação do título e do registro profissional que assinam o PDF da dieta.
// Aceita só o que um registro/título legítimo precisa (letras, números, espaço e . - / , ( ) º ª #) e corta o resto:
// o texto vai parar dentro de um PDF em HTML, então nada de < > " & etc.
const MAX_TITLE = 40;
const MAX_REGISTRY = 40;

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v
    .normalize('NFC')
    .replace(/<[^>]*>/g, '')                        // tira etiquetas HTML inteiras (<b>, <script>...)
    .replace(/[^\p{L}\p{N} .,\-\/()ºª#]/gu, '')   // letras (com acento), números e a pontuação de um registro
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return s.length ? s : null;
};

export function sanitizeProfessional(input: any): { title: string | null; registry: string | null } {
  return { title: clean(input?.title, MAX_TITLE), registry: clean(input?.registry, MAX_REGISTRY) };
}

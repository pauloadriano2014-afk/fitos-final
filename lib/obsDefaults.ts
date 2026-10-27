// lib/obsDefaults.ts
// 🗂️ (27 out 2026) Padrão de categorias e frases prontas do recado que cada coach PARCEIRO recebe na primeira vez que abre o Montar treino.
// É uma CÓPIA: o coach renomeia, troca a cor, apaga e cria à vontade, e mudar este arquivo depois não altera a lista de quem já começou
// (quem quiser de volta o que apagou usa "Restaurar padrão"). O time master (Paulo e Adri) não usa isto: mantém a lista compartilhada de sempre.
export type ObsDefaultCategory = { name: string; color: string; phrases: string[] };

export const OBS_DEFAULTS: ObsDefaultCategory[] = [
  { name: 'Técnica', color: '#32ADE6', phrases: [
    'Controle a descida: 2 a 3 segundos.',
    'Movimento lento e controlado, sem balançar o corpo.',
    'Amplitude máxima, sem perder o controle.',
    'Segure 1 a 2 segundos no pico da contração.',
    'Foque em sentir o músculo trabalhando.',
    'Pause 1 segundo embaixo, sem relaxar o músculo.',
  ] },
  { name: 'Postura', color: '#AF52DE', phrases: [
    'Coluna neutra e peito aberto.',
    'Ombros para trás e para baixo.',
    'Abdômen contraído durante todo o movimento.',
    'Joelhos alinhados com a ponta dos pés.',
    'Pés firmes no chão.',
    'Olhar à frente e pescoço relaxado.',
  ] },
  { name: 'Respiração', color: '#64D2FF', phrases: [
    'Expire na força (quando empurra ou puxa) e inspire na volta.',
    'Não prenda a respiração.',
    'Respire no seu ritmo, sem pressa.',
  ] },
  { name: 'Contagem', color: '#5E5CE6', phrases: [
    '10 repetições para cada lado.',
    '20 segundos para cada lado.',
    '1 passada com cada perna = 1 repetição.',
    'Direita + esquerda = 1 repetição.',
    'Conte só as repetições bem feitas.',
  ] },
  { name: 'Como fazer', color: '#FF9F0A', phrases: [
    'Faça de um lado de cada vez (unilateral).',
    'Pode fazer sentado numa cadeira com encosto.',
    'Pode fazer deitado no colchonete ou no chão.',
    'Em casa, use garrafas com água ou uma mochila como carga.',
    'Apoie na parede se perder o equilíbrio.',
    'Se não tiver o aparelho, me avise que eu troco.',
  ] },
  { name: 'Carga e intensidade', color: '#34C759', phrases: [
    'Use uma carga que deixe 1 a 2 repetições sobrando no fim da série.',
    'Só aumente a carga se fizer todas as repetições com boa técnica.',
    'Se perder a técnica, reduza a carga.',
    'Na última série, vá até a falha técnica.',
    'Anote a carga que você usou.',
  ] },
  { name: 'Aquecimento e descanso', color: '#A2845E', phrases: [
    'Faça 1 série leve de aquecimento antes.',
    'Aqueça a articulação com movimentos leves antes de pegar carga.',
    'Descanse o tempo indicado, sem pressa.',
    'Sem descanso entre os exercícios do bi-set.',
  ] },
  { name: 'Cuidados', color: '#FF375F', phrases: [
    'Se sentir dor na articulação, pare e me avise.',
    'Não force além do que o seu corpo permite hoje.',
    'Não trave o joelho nem o cotovelo no fim do movimento.',
    'Não deixe a lombar arquear.',
  ] },
];

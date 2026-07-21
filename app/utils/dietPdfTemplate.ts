// utils/dietPdfTemplate.ts
// Gera o HTML completo do PDF da dieta — layout PA TEAM ELITE

const LOGO_URL =
  'https://i.postimg.cc/YSrDNBTm/INTELIGENCIA-FINANCEIRA-(Post-para-Instagram-(45)).png';

const DAY_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  TREINO:   { label: 'Dia de Treino',          color: '#00C851', bg: '#0a1a0e', icon: '💪' },
  TCARDIO:  { label: 'Dia de Treino + Cardio', color: '#FF8C00', bg: '#1a1200', icon: '🔥' },
  CARDIO:   { label: 'Dia de Cardio',          color: '#00BFFF', bg: '#001a2a', icon: '🏃' },
  DESCANSO: { label: 'Dia de Descanso',        color: '#9B59B6', bg: '#16001a', icon: '😴' },
};

function calcMealMacros(items: any[]) {
  return items.reduce(
    (acc, item) => {
      const factor = (item.gramAmount ?? item.amount ?? 0) / 100;
      return {
        kcal: acc.kcal + (item.calories  ?? 0) * factor,
        p:    acc.p    + (item.protein   ?? 0) * factor,
        c:    acc.c    + (item.carbs     ?? 0) * factor,
        f:    acc.f    + (item.fats      ?? 0) * factor,
      };
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}

function r(n: number) {
  return Math.round(n);
}

function renderItems(items: any[]): string {
  return items
    .map((item) => {
      const factor = (item.gramAmount ?? item.amount ?? 0) / 100;
      const kcal = r((item.calories ?? 0) * factor);
      const p    = r((item.protein  ?? 0) * factor);
      const c    = r((item.carbs    ?? 0) * factor);
      const f    = r((item.fats     ?? 0) * factor);
      const unit = ['g','ml'].includes(item.unit ?? '') ? item.unit : ` ${item.unit ?? ''}`;
      return `
        <tr>
          <td class="food-name">${item.name}</td>
          <td class="food-amount">${item.amount}${unit}</td>
          <td class="food-macro">${kcal} kcal</td>
          <td class="food-macro">${p}g P</td>
          <td class="food-macro">${c}g C</td>
          <td class="food-macro">${f}g G</td>
        </tr>`;
    })
    .join('');
}

function renderMeals(meals: any[]): string {
  return meals
    .map((meal) => {
      const macros     = calcMealMacros(meal.items);
      const notesHtml  = meal.notes
        ? `<div class="meal-notes">📝 ${meal.notes}</div>`
        : '';

      return `
        <div class="meal-card">
          <div class="meal-header">
            <div class="meal-title-row">
              <span class="meal-name">${meal.name}</span>
              <span class="meal-time">🕐 ${meal.time ?? '--:--'}</span>
            </div>
            <div class="meal-macros-summary">
              <span class="macro-pill kcal">${r(macros.kcal)} kcal</span>
              <span class="macro-pill prot">${r(macros.p)}g P</span>
              <span class="macro-pill carb">${r(macros.c)}g C</span>
              <span class="macro-pill gord">${r(macros.f)}g G</span>
            </div>
          </div>
          <table class="food-table">
            <thead>
              <tr>
                <th>Alimento</th>
                <th>Qtd</th>
                <th>Kcal</th>
                <th>Prot</th>
                <th>Carbo</th>
                <th>Gord</th>
              </tr>
            </thead>
            <tbody>${renderItems(meal.items)}</tbody>
          </table>
          ${notesHtml}
        </div>`;
    })
    .join('');
}

export function generateDietHtml(user: any, diet: any): string {
  // ── Agrupa refeições por tipo de dia ──────────────────────────────────────
  const dayGroups: Record<string, any[]> = {};
  for (const meal of diet.meals) {
    const key = meal.dayType ?? 'TREINO';
    if (!dayGroups[key]) dayGroups[key] = [];
    dayGroups[key].push(meal);
  }

  const dayOrder    = ['TREINO', 'TCARDIO', 'CARDIO', 'DESCANSO'];
  const daySections = dayOrder
    .filter((dt) => dayGroups[dt]?.length)
    .map((dt) => {
      const cfg = DAY_TYPE_CONFIG[dt] ?? DAY_TYPE_CONFIG['TREINO'];
      return `
        <div class="day-section">
          <div class="day-header" style="background:${cfg.bg}; border-left:4px solid ${cfg.color};">
            <span class="day-icon">${cfg.icon}</span>
            <span class="day-label" style="color:${cfg.color}">${cfg.label}</span>
          </div>
          ${renderMeals(dayGroups[dt])}
        </div>`;
    })
    .join('');

  // ── Foto do aluno ─────────────────────────────────────────────────────────
  const photoHtml = user.photoUrl
    ? `<img class="student-photo" src="${user.photoUrl}" alt="Foto" />`
    : `<div class="student-photo-placeholder">👤</div>`;

  // ── Observações gerais ────────────────────────────────────────────────────
  const generalNotesHtml = diet.generalNotes
    ? `<div class="general-notes">
         <div class="notes-title">📋 Observações Gerais</div>
         <p>${diet.generalNotes}</p>
       </div>`
    : '';

  // ── Barras de distribuição ────────────────────────────────────────────────
  const totalKcal = diet.totalKcal || 1;
  const protPct   = Math.round(((diet.totalProtein || 0) * 4 / totalKcal) * 100);
  const carbPct   = Math.round(((diet.totalCarbs   || 0) * 4 / totalKcal) * 100);
  const gordPct   = Math.round(((diet.totalFats    || 0) * 9 / totalKcal) * 100);

  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Dieta – ${user.name}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',Arial,sans-serif; background:#0d0d0d; color:#e8e8e8; font-size:11px; }

/* CABEÇALHO */
.header {
  background: linear-gradient(135deg, #0d0d0d 0%, #1a1a1a 50%, #0d1a0d 100%);
  padding: 28px 28px 22px;
  display: flex; align-items: center; gap: 20px;
  border-bottom: 2px solid #00C851;
}
.logo { width:76px; height:76px; object-fit:contain; border-radius:12px; flex-shrink:0; }
.header-info { flex:1; }
.brand-name { font-size:9px; letter-spacing:3px; color:#00C851; text-transform:uppercase; font-weight:700; margin-bottom:4px; }
.doc-title { font-size:22px; font-weight:900; color:#fff; letter-spacing:1px; }
.doc-subtitle { font-size:10px; color:#666; margin-top:4px; }

.student-block {
  display:flex; align-items:center; gap:12px;
  background:rgba(0,200,81,0.08); border:1px solid rgba(0,200,81,0.2);
  border-radius:12px; padding:10px 14px; flex-shrink:0;
}
.student-photo { width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid #00C851; }
.student-photo-placeholder {
  width:52px; height:52px; border-radius:50%; background:#1e1e1e;
  border:2px solid #00C851; display:flex; align-items:center; justify-content:center; font-size:22px;
}
.student-name { font-size:13px; font-weight:700; color:#fff; }
.student-meta { font-size:10px; color:#888; margin-top:2px; }

/* MACROS */
.macros-section { background:#111; padding:18px 28px; border-bottom:1px solid #222; }
.macros-title { font-size:9px; letter-spacing:2px; color:#00C851; text-transform:uppercase; font-weight:700; margin-bottom:14px; }
.macros-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:12px; }
.macro-card { background:#1a1a1a; border-radius:10px; padding:12px; text-align:center; border:1px solid #2a2a2a; }
.macro-value { font-size:20px; font-weight:900; line-height:1; }
.macro-unit { font-size:10px; color:#666; font-weight:400; }
.macro-label { font-size:8.5px; letter-spacing:1.5px; text-transform:uppercase; color:#666; margin-top:4px; }
.kcal-val { color:#FFD700; } .prot-val { color:#00C851; } .carb-val { color:#00BFFF; } .gord-val { color:#FF6B6B; }

.bar-row { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
.bar-label { width:60px; font-size:9px; color:#666; text-align:right; }
.bar-track { flex:1; height:6px; background:#222; border-radius:3px; overflow:hidden; }
.bar-fill { height:100%; border-radius:3px; }
.bar-pct { width:28px; font-size:9px; color:#555; }
.water-row { margin-top:10px; font-size:10px; color:#00BFFF; }

/* CONTEÚDO */
.content { padding:0 28px 28px; }
.day-section { margin-top:18px; }
.day-header { display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:8px; margin-bottom:10px; }
.day-icon { font-size:15px; }
.day-label { font-size:13px; font-weight:800; }

/* CARDS DE REFEIÇÃO */
.meal-card { background:#161616; border:1px solid #252525; border-radius:10px; margin-bottom:8px; overflow:hidden; }
.meal-header { padding:10px 14px; background:#1a1a1a; border-bottom:1px solid #252525; }
.meal-title-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.meal-name { font-size:13px; font-weight:700; color:#fff; }
.meal-time { font-size:9.5px; color:#888; background:#222; padding:2px 8px; border-radius:20px; }
.meal-macros-summary { display:flex; gap:5px; flex-wrap:wrap; }
.macro-pill { font-size:9px; font-weight:700; padding:2px 8px; border-radius:20px; }
.macro-pill.kcal { background:rgba(255,215,0,0.12);  color:#FFD700; }
.macro-pill.prot { background:rgba(0,200,81,0.12);   color:#00C851; }
.macro-pill.carb { background:rgba(0,191,255,0.12);  color:#00BFFF; }
.macro-pill.gord { background:rgba(255,107,107,0.12);color:#FF6B6B; }

/* TABELA */
.food-table { width:100%; border-collapse:collapse; }
.food-table thead tr { background:#111; }
.food-table th { padding:5px 10px; font-size:8px; letter-spacing:1px; text-transform:uppercase; color:#555; font-weight:600; text-align:left; }
.food-table th:not(:first-child) { text-align:center; }
.food-table tbody tr:nth-child(even) { background:#131313; }
.food-table tbody tr:nth-child(odd)  { background:#161616; }
.food-table td { padding:6px 10px; border-top:1px solid #1e1e1e; vertical-align:middle; }
td.food-name   { font-size:10.5px; color:#ddd; font-weight:500; }
td.food-amount { font-size:10px; color:#aaa; text-align:center; white-space:nowrap; }
td.food-macro  { font-size:9.5px; color:#777; text-align:center; white-space:nowrap; }

.meal-notes { padding:7px 14px; font-size:9.5px; color:#777; background:#111; border-top:1px solid #1e1e1e; font-style:italic; }

/* OBSERVAÇÕES GERAIS */
.general-notes { background:#0f1a0f; border:1px solid rgba(0,200,81,0.2); border-radius:10px; padding:16px; margin-top:20px; }
.notes-title { font-size:11px; font-weight:700; color:#00C851; margin-bottom:8px; }
.general-notes p { font-size:10.5px; color:#aaa; line-height:1.7; white-space:pre-wrap; }

/* RODAPÉ */
.footer { margin-top:22px; padding:14px 0; border-top:1px solid #1e1e1e; display:flex; justify-content:space-between; }
.footer-brand { font-size:9px; color:#444; letter-spacing:1px; text-transform:uppercase; }
.footer-date  { font-size:9px; color:#333; }
</style>
</head>
<body>

<div class="header">
  <img class="logo" src="${LOGO_URL}" alt="PA Team Elite"/>
  <div class="header-info">
    <div class="brand-name">PA Team Elite</div>
    <div class="doc-title">PLANO ALIMENTAR</div>
    <div class="doc-subtitle">Dieta personalizada • ${today}</div>
  </div>
  <div class="student-block">
    ${photoHtml}
    <div>
      <div class="student-name">${user.name ?? 'Aluno'}</div>
      ${user.goal ? `<div class="student-meta">${user.goal}</div>` : ''}
      ${user.currentWeight ? `<div class="student-meta">${user.currentWeight} kg</div>` : ''}
    </div>
  </div>
</div>

<div class="macros-section">
  <div class="macros-title">⚡ Resumo de Macronutrientes</div>
  <div class="macros-grid">
    <div class="macro-card">
      <div class="macro-value kcal-val">${r(diet.totalKcal ?? 0)}<span class="macro-unit"> kcal</span></div>
      <div class="macro-label">Calorias</div>
    </div>
    <div class="macro-card">
      <div class="macro-value prot-val">${r(diet.totalProtein ?? 0)}<span class="macro-unit">g</span></div>
      <div class="macro-label">Proteína</div>
    </div>
    <div class="macro-card">
      <div class="macro-value carb-val">${r(diet.totalCarbs ?? 0)}<span class="macro-unit">g</span></div>
      <div class="macro-label">Carboidrato</div>
    </div>
    <div class="macro-card">
      <div class="macro-value gord-val">${r(diet.totalFats ?? 0)}<span class="macro-unit">g</span></div>
      <div class="macro-label">Gordura</div>
    </div>
  </div>
  <div>
    <div class="bar-row">
      <span class="bar-label">Proteína</span>
      <div class="bar-track"><div class="bar-fill" style="width:${protPct}%;background:#00C851"></div></div>
      <span class="bar-pct">${protPct}%</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">Carboidrato</span>
      <div class="bar-track"><div class="bar-fill" style="width:${carbPct}%;background:#00BFFF"></div></div>
      <span class="bar-pct">${carbPct}%</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">Gordura</span>
      <div class="bar-track"><div class="bar-fill" style="width:${gordPct}%;background:#FF6B6B"></div></div>
      <span class="bar-pct">${gordPct}%</span>
    </div>
  </div>
  ${diet.waterIntake ? `<div class="water-row">💧 Meta de água: <strong>${diet.waterIntake}ml</strong> por dia</div>` : ''}
</div>

<div class="content">
  ${daySections}
  ${generalNotesHtml}
  <div class="footer">
    <span class="footer-brand">PA Team Elite · Paulo Adriano</span>
    <span class="footer-date">Gerado em ${today}</span>
  </div>
</div>

</body>
</html>`;
}
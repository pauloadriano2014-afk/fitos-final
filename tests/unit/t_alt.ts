import assert from 'assert';
import { db } from './mocks';
import { groupMealsWithAlternatives, altScopeKey } from '/home/user/fitos-final/lib/dietAlt';
import { GET as studentGet } from '/home/user/fitos-final/app/api/diet/[userId]/route';
import { GET as coachGet } from '/home/user/fitos-final/app/api/admin/diet/[userId]/route';
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e).split('\n').slice(0, 3).join('\n   ')); } };
// dieta REAL do caso: a principal "Lanche da Tarde" existe nas 3 abas com o MESMO grupo e cada aba tem 1 alternativa; o Almoço tem o grupo igual nas 3 abas e nenhuma alternativa
const item = (id: string) => ({ id, name: 'x', amount: 100, unit: 'g', calories: 100, protein: 1, carbs: 1, fats: 1, substitutionGroupId: 'g' });
const M = (id: string, name: string, dayType: string, main: boolean, group: string | null, label: string | null = null) => ({ id, name, time: '16:00', notes: '', dayType, isMainVersion: main, alternativeGroupId: group, alternativeLabel: label, order: 0, items: [item(id + '-i')] });
const DAYS = ['TREINO', 'DESCANSO', 'TREINO_CARDIO'];
const meals: any[] = [];
for (const d of DAYS) { meals.push(M('alm-' + d, 'Almoço', d, true, 'alt-A')); meals.push(M('lan-' + d, 'Lanche da Tarde', d, true, 'alt-L')); meals.push(M('alt-' + d, 'Lanche da Tarde', d, false, 'alt-L', 'Pão com carne')); }
const diet = { id: 'd1', goal: 'x', totalKcal: 1, totalProtein: 1, totalCarbs: 1, totalFats: 1, waterIntake: '3', generalNotes: '', isStrategy: false, isActive: true, meals };
const authReq = (id: string) => { const r: any = { url: 'http://x/api', json: async () => ({}) }; r.__auth = { id, role: 'COACH' }; return r; };

(async () => {
  await t('cada principal recebe só as alternativas da PRÓPRIA aba (antes: 3 por aba)', () => {
    const { mainMeals, alternativesOf } = groupMealsWithAlternatives(meals);
    assert.equal(mainMeals.length, 6, '3 almoços + 3 lanches principais');
    for (const m of mainMeals) {
      const alts = alternativesOf(m);
      if (m.name === 'Lanche da Tarde') { assert.equal(alts.length, 1, m.dayType); assert.equal(alts[0].dayType, m.dayType, 'a alternativa é da mesma aba'); assert.equal(alts[0].alternativeLabel, 'Pão com carne'); }
      else assert.equal(alts.length, 0, 'Almoço sem alternativa');
    }
    // a regra antiga (só pelo grupo) dava 3: confirma que o caso reproduz o bug
    const old = meals.filter((m) => m.isMainVersion === false && m.alternativeGroupId === 'alt-L').length; assert.equal(old, 3);
  });
  await t('aba "PADRÃO"/sem aba conta como TREINO (igual ao app) e refeição sem grupo nunca recebe alternativa', () => {
    const l = [M('a', 'A', 'PADRÃO', true, 'g1'), M('b', 'A', 'TREINO', false, 'g1', 'Alt'), M('c', 'B', 'TREINO', true, null), M('d', 'B', 'TREINO', false, 'g2', 'Solta')];
    const { mainMeals, alternativesOf } = groupMealsWithAlternatives(l);
    assert.equal(alternativesOf(mainMeals.find((m) => m.id === 'a')!).length, 1); assert.equal(alternativesOf(mainMeals.find((m) => m.id === 'c')!).length, 0);
    assert.equal(altScopeKey({ dayType: null, alternativeGroupId: 'x' }), 'TREINO::x');
  });
  await t('rota do aluno e rota do coach devolvem 1 alternativa por aba (era 3 em cada)', async () => {
    db.users.length = 0; db.users.push({ id: 'aluno', coachId: 'coach-1' });
    (db as any).diet = diet;
    const mod: any = (await import('./mocks')).default; mod.diet = { findFirst: async () => diet, findMany: async () => [diet] };
    const r: any = await coachGet(authReq('coach-1') as any, { params: { userId: 'aluno' } } as any);
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    for (const d of DAYS) { const lan = r.body.meals.find((m: any) => m.name === 'Lanche da Tarde' && m.dayType === d); assert.equal(lan.alternatives.length, 1, d); const alm = r.body.meals.find((m: any) => m.name === 'Almoço' && m.dayType === d); assert.equal(alm.alternatives.length, 0, d); }
    assert.equal(r.body.meals.reduce((n: number, m: any) => n + m.alternatives.length, 0), 3, 'total 3 (uma por aba), e não 9');
    const s: any = await studentGet(authReq('aluno') as any, { params: { userId: 'aluno' } } as any);
    assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 200));
    const alts = (s.body.meals || s.body.diet?.meals || []).reduce((n: number, m: any) => n + (m.alternatives || []).length, 0); assert.equal(alts, 3, 'rota do aluno: 3 no total');
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();

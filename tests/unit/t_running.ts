import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as PL from '/home/user/fitos-final/lib/runningPlans';
import * as PR from '/home/user/fitos-final/lib/runningProgress';
import { GET as userGET } from '/home/user/fitos-final/app/api/running/[userId]/route';
import { POST as logPOST } from '/home/user/fitos-final/app/api/running/log/route';
import { POST as protoPOST, PATCH as protoPATCH } from '/home/user/fitos-final/app/api/running/protocol/route';
import { POST as progPOST } from '/home/user/fitos-final/app/api/running/[userId]/progress/route';
import { POST as genPOST } from '/home/user/fitos-final/app/api/running/generate/route';
import { POST as anamPOST } from '/home/user/fitos-final/app/api/running/anamnese/[token]/route';
import * as RM from '/home/user/fitos-final/lib/runningMessages';
import * as FP from '/home/user/FIT-OS-FRONTEND/src/utils/runningPlans.js';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH', coachId: string | null = null) => jwt.sign({ id, role, coachId }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}, ctx?: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers: { ...headers, ...(init.headers || {}) } }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) });
const patch = (o: any) => ({ method: 'PATCH', body: JSON.stringify(o) });
const DAY = 86400000;
const T0 = new Date('2026-09-01T12:00:00Z');
const at = (n: number) => new Date(T0.getTime() + n * DAY);
const ago = (n: number) => new Date(Date.now() - n * DAY);
const pushes = () => ((globalThis as any).__pushes || []) as any[];
const clearPushes = () => { (globalThis as any).__pushes = []; (globalThis as any).__pushFail = false; };
const settle = () => new Promise((r) => setTimeout(r, 25));

const seed = () => {
  P.__reset(); (globalThis as any).__llmCalls = 0; clearPushes();
  const u = (o: any) => S.user.push({ role: 'USER', active: true, name: o.id, coachId: null, gender: 'F', ...o });
  u({ id: PAULO_ID, role: 'ADMIN', name: 'Paulo Master' });
  u({ id: 'cA', role: 'COACH' }); u({ id: 'cB', role: 'COACH' });
  u({ id: 's1', coachId: 'cA' }); u({ id: 's2', coachId: 'cB' }); u({ id: 'sm', coachId: PAULO_ID }); u({ id: 'so' });
};
const asS1 = () => tok('s1', 'USER', 'cA');
const mkProto = (o: any = {}) => { const row = { id: 'p' + S.nextId++, userId: 's1', isActive: true, protocolType: '5K', startWeek: 1, startDate: ago(2), currentWeek: 1, weekOpenedAt: ago(2), ...o }; S.runningProtocol.push({ name: 'Protocolo 5K', trainingDays: [], customSpeeds: null, completedAt: null, lastRepeatWeek: null, progressNote: null, customNotes: null, adaptations: null, createdAt: new Date(), updatedAt: new Date(), ...row }); return S.runningProtocol[S.runningProtocol.length - 1]; };
const mkLog = (o: any = {}) => { const row = { id: 'l' + S.nextId++, userId: 's1', protocolId: null, week: 1, block: 1, sessionDay: 'QUARTA', createdAt: new Date(), date: new Date(), ...o }; S.runningLog.push(row); return row; };
const anam = (o: any = {}) => { S.runningAnamnese.push({ id: 'a' + S.nextId++, userId: 's1', token: 'tk', filled: true, runningExperience: 'never', canJog5min: false, canWalk30min: true, fitnessLevel: 2, injuries: ['Nenhuma'], availableDays: ['SEG', 'QUA', 'SEX', 'DOM'], medicalClearance: 'yes', runningGoal: 'complete_5k', weeklyFrequencyNow: '0', completedRaces: false, ...o }); };
const llm = (fn: any) => { (globalThis as any).__LLM = async (a: any) => { (globalThis as any).__llmCalls++; return fn(a); }; };
const aiText = (obj: any, fenced = true) => ({ content: [{ type: 'text', text: fenced ? '```json\n' + JSON.stringify(obj) + '\n```' : JSON.stringify(obj) }] });

// protocolo "puro" para as contas de andamento
const proto = (o: any = {}) => ({ id: 'p1', protocolType: '5K', startWeek: 1, startDate: at(0), currentWeek: 1, weekOpenedAt: at(0), completedAt: null, lastRepeatWeek: null, progressNote: null, ...o });
const lg = (day: string, n: number, rpe: number | null = null, extra: any = {}) => ({ protocolId: 'p1', sessionDay: day, createdAt: at(n), rpe, ...extra });
const K = ['QUARTA', 'SEXTA', 'DOMINGO'];

let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => {
  try { seed(); await fn(); passed++; console.log('  ok  ' + name); }
  catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); }
};

(async () => {
  // ───────────────────────── planos (os dois lados e a sanidade do conteúdo) ─────────────────────────
  await block('planos: semanas e blocos do servidor = os do app', () => {
    for (const t of PL.PLAN_TYPES) {
      const plan = FP.getPlan(t);
      assert.strictEqual(plan.totalWeeks, PL.PLAN_META[t].weeks, t + ' semanas');
      assert.deepStrictEqual(plan.blocks.map((b: any) => b.weeks), PL.PLAN_META[t].blocks.map((b) => [b[0], b[1]]), t + ' blocos');
      for (let w = 1; w <= plan.totalWeeks; w++) assert.strictEqual(FP.blockOfWeek(plan, w), PL.blockOfWeek(t, w), `${t} semana ${w}`);
      assert.strictEqual(plan.distanceKm, PL.PLAN_META[t].distanceKm);
    }
  });
  await block('planos: 5K confere com a tabela original do coach (minutos por treino)', () => {
    const plan = FP.getPlan('5K');
    const mins = (w: number, k: string) => Math.round(FP.sessionStats(FP.getSession(plan, w, k).phases).totalSec / 60);
    assert.deepStrictEqual(['QUARTA', 'SEXTA', 'DOMINGO'].map((k) => mins(1, k)), [30, 25, 30]);
    assert.deepStrictEqual(['QUARTA', 'SEXTA', 'DOMINGO'].map((k) => mins(2, k)), [30, 25, 30]);
    assert.deepStrictEqual(['QUARTA', 'DOMINGO'].map((k) => mins(3, k)), [25, 35], 'semana 3 usa o começo das faixas 15 e 35 min');
    assert.deepStrictEqual(['QUARTA', 'DOMINGO'].map((k) => mins(4, k)), [30, 40], 'semana 4 usa o fim das faixas 20 e 40 min');
    assert.strictEqual(mins(3, 'SEXTA'), 5 + 8 * 3 + 3); assert.strictEqual(mins(4, 'SEXTA'), 5 + 8 * 3 + 4);
    assert.deepStrictEqual(['QUARTA', 'SEXTA', 'DOMINGO'].map((k) => mins(5, k)), [33, 35, 35]);
    assert.strictEqual(mins(7, 'QUARTA'), 30); assert.strictEqual(mins(7, 'SEXTA'), 5 + 6 * 4);
    assert.strictEqual(mins(8, 'QUARTA'), 20); assert.strictEqual(mins(8, 'SEXTA'), 12);
    // etapas por distância (4 km na semana 7, 5 km na 8) e a estimativa vem da velocidade da zona
    const w7 = FP.sessionStats(FP.getSession(plan, 7, 'DOMINGO').phases), w8 = FP.sessionStats(FP.getSession(plan, 8, 'DOMINGO').phases);
    assert.strictEqual(w7.hasDistance, true); assert.strictEqual(w7.distanceKm, 4); assert.strictEqual(w8.distanceKm, 5);
    assert.strictEqual(w8.totalSec, Math.round(5 / 8.2 * 3600));
    // o texto antigo que o cronômetro lia errado: agora ninguém tem fase de mais de 1 hora fora dos longões
    for (const w of plan.weeks) for (const k of PL.SESSION_KEYS) for (const s of FP.buildSteps(FP.getSession(plan, w.week, k).phases)) if (s.sec) assert.ok(s.sec <= 40 * 60, `5K sem.${w.week} ${k} ${s.fase} ${s.sec}s`);
  });
  await block('planos: B1 quarta = caminhada 5 + 6×(2 corre + 2 anda) + 1; repetições abrem certo', () => {
    const plan = FP.getPlan('5K');
    const steps = FP.buildSteps(FP.getSession(plan, 1, 'QUARTA').phases);
    assert.strictEqual(steps.length, 1 + 12 + 1);
    assert.deepStrictEqual(steps.slice(1, 3).map((s: any) => [s.fase, s.sec, s.round, s.rounds]), [['Corrida leve', 120, 1, 6], ['Caminhada', 120, 1, 6]]);
    assert.strictEqual(steps[steps.length - 2].round, 6);
    const rows = FP.displayRows(FP.getSession(plan, 1, 'QUARTA').phases);
    assert.deepStrictEqual(rows.map((r: any) => r.fase), ['Caminhada', 'Repetir × 6', 'Corrida leve', 'Caminhada', 'Caminhada final']);
    assert.strictEqual(rows[1].header, true); assert.strictEqual(rows[2].indent, true); assert.strictEqual(rows[0].tempo, '5 min');
  });
  await block('planos: 10K/21K/42K têm 3 treinos por semana, fases válidas e terminam na prova', () => {
    for (const t of ['10K', '21K', '42K']) {
      const plan = FP.getPlan(t);
      assert.strictEqual(plan.weeks.length, plan.totalWeeks);
      for (const w of plan.weeks) {
        assert.deepStrictEqual(Object.keys(w.sessions), PL.SESSION_KEYS.slice(), `${t} sem.${w.week} chaves`);
        for (const k of PL.SESSION_KEYS) {
          const s = w.sessions[k]; assert.ok(s.title && s.phases.length, `${t} sem.${w.week} ${k}`);
          for (const st of FP.buildSteps(s.phases)) { assert.ok(FP.ZONES[st.zone], 'zona ' + st.zone); assert.ok(st.km ? st.km > 0 : (Number.isInteger(st.sec) && st.sec > 0), `${t} sem.${w.week} ${k} ${st.fase}`); }
        }
      }
      const last = FP.getSession(plan, plan.totalWeeks, 'DOMINGO');
      assert.ok(last.title.includes('🏁')); assert.strictEqual(FP.sessionStats(last.phases).distanceKm, plan.distanceKm, t + ' prova');
      // só a prova é por distância
      plan.weeks.forEach((w: any) => PL.SESSION_KEYS.forEach((k) => { if (!(w.week === plan.totalWeeks && k === 'DOMINGO')) assert.strictEqual(FP.sessionStats(w.sessions[k].phases).hasDistance, false, `${t} sem.${w.week} ${k}`); }));
    }
  });
  await block('planos: progressão segura (volume ≤ +15%, longão ≤ +15%, polimento, pico)', () => {
    for (const t of ['5K', '10K', '21K', '42K']) {
      const plan = FP.getPlan(t);
      const totals = plan.weeks.map((w: any) => FP.weekMinutes(plan, w.week));
      const longs = plan.weeks.map((w: any) => FP.sessionStats(w.sessions.DOMINGO.phases).totalSec / 60);
      let peak = 0, peakLong = 0;
      plan.weeks.forEach((w: any, i: number) => {
        const skip = w.tag === 'recovery' || w.tag === 'taper' || w.tag === 'race';
        if (!skip && i > 0) {
          assert.ok(totals[i] <= peak * 1.15 + 0.5, `${t} sem.${w.week} volume ${totals[i]} vs pico anterior ${peak}`);
          if (t !== '5K') assert.ok(longs[i] <= peakLong * 1.15 + 0.5, `${t} sem.${w.week} longão ${longs[i]} vs ${peakLong}`);
        }
        if (w.tag !== 'race') { peak = Math.max(peak, totals[i]); peakLong = Math.max(peakLong, longs[i]); }
      });
      if (t !== '5K') {
        const recov = plan.weeks.filter((w: any) => w.tag === 'recovery'); assert.ok(recov.length >= 1, t + ' tem semana de recuperação');
        recov.forEach((w: any) => assert.ok(totals[w.week - 1] < totals[w.week - 2], `${t} recuperação sem.${w.week}`));
        const taper = plan.weeks.find((w: any) => w.tag === 'taper'); assert.ok(totals[taper.week - 1] < peak * 0.85, `${t} polimento ${totals[taper.week - 1]} < 85% do pico ${peak}`);
        assert.strictEqual(plan.weeks[plan.totalWeeks - 1].tag, 'race');
        assert.ok(plan.weeks.slice(0, -1).every((w: any) => longs[w.week - 1] <= peakLong), 'sem longão acima do pico');
      }
    }
    const pk = (t: string) => Math.max(...FP.getPlan(t).weeks.slice(0, -1).map((w: any) => FP.sessionStats(w.sessions.DOMINGO.phases).totalSec / 60));
    assert.ok(pk('10K') >= 60 && pk('21K') >= 120 && pk('42K') >= 180, 'picos de longão ' + [pk('10K'), pk('21K'), pk('42K')]);
  });
  await block('planos: velocidades do aluno (customSpeeds) valem nas fases e os textos saem certos', () => {
    assert.strictEqual(FP.paceFromSpeed(8), '7:30 /km'); assert.strictEqual(FP.paceFromSpeed(7.5), '8:00 /km'); assert.strictEqual(FP.paceFromSpeed(0), '');
    const plan = FP.getPlan('5K'), ph = FP.getSession(plan, 1, 'QUARTA').phases;
    const dflt = FP.buildSteps(ph), custom = FP.buildSteps(ph, { z2: 7, z3: 7.6, z4: 8.6, z5: 9.6 });
    assert.strictEqual(dflt[1].esteira, '7.5 km/h'); assert.strictEqual(custom[1].esteira, '7 km/h'); assert.strictEqual(custom[1].rua, '8:34 /km');
    assert.strictEqual(custom[0].esteira, dflt[0].esteira, 'caminhada não é personalizada');
    assert.strictEqual(FP.formatPhaseAmount({ sec: 90 }), '1 min 30 s'); assert.strictEqual(FP.formatPhaseAmount({ sec: 30 }), '30 s'); assert.strictEqual(FP.formatPhaseAmount({ km: 21.1 }), '21,1 km'); assert.strictEqual(FP.formatPhaseAmount({ sec: 300 }), '5 min');
    assert.strictEqual(FP.formatDuration(5400), '1 h 30 min'); assert.strictEqual(FP.formatDuration(2700), '45 min'); assert.strictEqual(FP.formatDuration(7200), '2 h');
    assert.strictEqual(FP.sessionDayLabel('QUARTA', ['TER', 'QUI', 'SAB']), 'Terça'); assert.strictEqual(FP.sessionDayLabel('DOMINGO', ['TER', 'QUI', 'SAB']), 'Sábado');
    assert.strictEqual(FP.sessionDayLabel('SEXTA', []), 'Sexta'); assert.strictEqual(FP.sessionDayLabel('DOMINGO', ['TER', 'QUI']), 'Domingo', 'lista incompleta = padrão');
    assert.strictEqual(FP.normalizeType('10K'), '10K'); assert.strictEqual(FP.normalizeType('xx'), '5K'); assert.strictEqual(FP.nextType('5K'), '10K'); assert.strictEqual(FP.nextType('42K'), null);
    assert.strictEqual(FP.clampWeek(plan, 99), 8); assert.strictEqual(FP.clampWeek(plan, -3), 1); assert.strictEqual(FP.clampWeek(plan, 'x'), 1);
  });

  // ───────────────────────── dias, velocidades, elegibilidade, sugestão ─────────────────────────
  await block('dias: normalização e validação dos dias de treino', () => {
    assert.deepStrictEqual(PL.normalizeTrainingDays(undefined), []); assert.deepStrictEqual(PL.normalizeTrainingDays(null), []); assert.deepStrictEqual(PL.normalizeTrainingDays([]), []);
    assert.deepStrictEqual(PL.normalizeTrainingDays(['ter', 'QUI', 'SÁB']), ['TER', 'QUI', 'SAB']);
    assert.strictEqual(PL.normalizeTrainingDays(['TER', 'TER', 'SAB']), null); assert.strictEqual(PL.normalizeTrainingDays(['TER', 'QUI']), null);
    assert.strictEqual(PL.normalizeTrainingDays(['TER', 'QUI', 'XXX']), null); assert.strictEqual(PL.normalizeTrainingDays('TER'), null); assert.strictEqual(PL.normalizeTrainingDays(['TER', 'QUI', 'SAB', 'DOM']), null);
    assert.strictEqual(PL.normalizeDay('sáb'), 'SAB'); assert.strictEqual(PL.normalizeDay('Quarta'), 'QUA'); assert.strictEqual(PL.normalizeDay(''), null); assert.strictEqual(PL.normalizeDay(5), null);
  });
  await block('dias: sugestão de 3 dias espaçados com o longão no fim de semana', () => {
    const all = PL.suggestTrainingDays(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);
    assert.strictEqual(all.usedDefault, false); assert.strictEqual(new Set(all.days).size, 3); assert.strictEqual(all.days[2], 'DOM', 'longão no domingo');
    const gap = (a: string, b: string) => { const i = (d: string) => PL.DAY_CODES.indexOf(d as any); const x = (i(b) - i(a) + 7) % 7; return x === 0 ? 7 : x; };
    assert.ok(gap(all.days[1], all.days[2]) >= 2 && gap(all.days[2], all.days[1]) >= 2, 'qualidade e longão não colados ' + all.days);
    const three = PL.suggestTrainingDays(['SEG', 'QUA', 'SEX']); assert.deepStrictEqual(three.days.slice().sort(), ['QUA', 'SEG', 'SEX']); assert.strictEqual(three.usedDefault, false);
    const sat = PL.suggestTrainingDays(['TER', 'QUI', 'SÁB']); assert.strictEqual(sat.days[2], 'SAB', 'só tem sábado: longão no sábado');
    const two = PL.suggestTrainingDays(['SEG', 'QUA']); assert.deepStrictEqual(two, { days: ['QUA', 'SEX', 'DOM'], usedDefault: true });
    assert.strictEqual(PL.suggestTrainingDays(undefined).usedDefault, true); assert.strictEqual(PL.suggestTrainingDays(['SEG', 'SEG', 'QUA']).usedDefault, true, 'repetidos contam uma vez');
    const weekdays = PL.suggestTrainingDays(['SEG', 'TER', 'QUA']); assert.strictEqual(weekdays.days.length, 3);
  });
  await block('velocidades: só aceita z2<z3<z4<z5 entre 4 e 20', () => {
    assert.deepStrictEqual(PL.sanitizeSpeeds({ z2: 7.5, z3: '8,2', z4: 9, z5: 10.04 }), { z2: 7.5, z3: 8.2, z4: 9, z5: 10 });
    for (const bad of [null, 5, { z2: 7, z3: 7, z4: 9, z5: 10 }, { z2: 7, z3: 8, z4: 9 }, { z2: 3, z3: 8, z4: 9, z5: 10 }, { z2: 7, z3: 8, z4: 9, z5: 21 }, { z2: 'a', z3: 8, z4: 9, z5: 10 }, { z2: 9, z3: 8, z4: 7, z5: 6 }]) assert.strictEqual(PL.sanitizeSpeeds(bad as any), null, JSON.stringify(bad));
  });
  await block('elegibilidade: 5K para todos; 10K/21K/42K só com histórico', () => {
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'never' }), ['5K']);
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'stopped', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3' }), ['5K'], 'parada não entra no 10K');
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3' }), ['5K', '10K']);
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3' }), ['5K'], 'ainda não passou dos 5');
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '1' }), ['5K'], 'treina pouco');
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', completedRaces: true, racesDescription: 'Fiz uma meia maratona em 2025' }), ['5K', '10K', '21K']);
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', completedRaces: true, racesDescription: '21k e uma de 10 km', medicalClearance: 'yes' }), ['5K', '10K', '21K']);
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '4', completedRaces: true, racesDescription: 'Maratona de Curitiba 2025', medicalClearance: 'yes' }), ['5K', '10K', '21K', '42K']);
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '4', completedRaces: true, racesDescription: 'Maratona de Curitiba 2025', medicalClearance: 'no' }), ['5K', '10K', '21K'], 'maratona exige liberação');
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '4', completedRaces: false, racesDescription: 'Maratona' }), ['5K', '10K'], 'texto sem prova completada não vale');
    assert.deepStrictEqual(PL.eligibleTypes(null), ['5K']);
  });
  await block('sugestão por regras: tipo, semana, velocidades, dias, avisos', () => {
    const beginner = PL.suggestByRules({ runningExperience: 'never', canJog5min: false, fitnessLevel: 2, runningGoal: 'complete_10k', availableDays: ['SEG', 'QUA', 'SEX'], injuries: ['Nenhuma'], medicalClearance: 'yes', canWalk30min: true });
    assert.strictEqual(beginner.protocolType, '5K'); assert.strictEqual(beginner.startWeek, 1); assert.deepStrictEqual(beginner.customSpeeds, PL.SPEED_PRESETS.iniciante);
    assert.ok(beginner.warnings.some((w) => /10K/.test(w) && /5K primeiro/.test(w)), 'avisa que o objetivo 10K precisa do 5K antes');
    const strong = PL.suggestByRules({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', fitnessLevel: 4, canJog5min: true, runningGoal: 'complete_10k', availableDays: ['TER', 'QUI', 'DOM'], medicalClearance: 'yes', injuries: ['Nenhuma'] });
    assert.strictEqual(strong.protocolType, '10K'); assert.strictEqual(strong.startWeek, 1); assert.deepStrictEqual(strong.customSpeeds, PL.SPEED_PRESETS.experiente); assert.deepStrictEqual(strong.trainingDays, ['TER', 'QUI', 'DOM']);
    const mid = PL.suggestByRules({ runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', fitnessLevel: 3, canJog5min: true, runningGoal: 'complete_5k', availableDays: [], medicalClearance: 'yes' });
    assert.strictEqual(mid.protocolType, '5K'); assert.strictEqual(mid.startWeek, 5); assert.ok(mid.warnings.some((w) => /menos de 3 dias/.test(w))); assert.deepStrictEqual(mid.trainingDays, ['QUA', 'SEX', 'DOM']);
    const cautious = PL.suggestByRules({ runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', fitnessLevel: 2, canJog5min: true, runningGoal: 'fitness', heartCondition: true, medicalClearance: 'not_consulted', injuries: ['Joelho'], jointIssues: true, canWalk30min: false, bodyPainDuringWalk: 'dor no joelho' });
    assert.strictEqual(cautious.startWeek, 1, 'nível baixo anula a entrada adiantada');
    for (const re of [/cardíaca/, /Sem liberação médica/, /Joelho/, /articular/, /caminhar 30/]) assert.ok(cautious.warnings.some((w) => re.test(w)), String(re));
    assert.ok(cautious.adaptations && /Joelho/.test(cautious.adaptations) && /dor ao caminhar/.test(cautious.adaptations) && /articular/.test(cautious.adaptations));
    const stopped = PL.suggestByRules({ runningExperience: 'stopped', timeStopped: 'Menos de 3 meses', maxDistanceBefore: '3 a 5km', canJog5min: true, fitnessLevel: 3 });
    assert.strictEqual(stopped.startWeek, 3);
    const none = PL.suggestByRules({}); assert.strictEqual(none.protocolType, '5K'); assert.strictEqual(none.adaptations, null);
    const weight = PL.suggestByRules({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', runningGoal: 'weight_loss', canJog5min: true, fitnessLevel: 4 });
    assert.strictEqual(weight.protocolType, '5K', 'emagrecer não empurra para 10K');
  });
  await block('IA: confere a resposta (tipo, semana, velocidades) e só aceita mais cautela', () => {
    const a = { runningExperience: 'never', canJog5min: false, fitnessLevel: 2, runningGoal: 'complete_5k', availableDays: ['SEG', 'QUA', 'SEX'], medicalClearance: 'yes', canWalk30min: true };
    const ok = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 1, customSpeeds: { z2: 7, z3: 7.6, z4: 8.6, z5: 9.6 }, adaptations: 'cuidado com o joelho', customNotes: 'ok' }, a);
    assert.deepStrictEqual(ok.corrections, []); assert.strictEqual(ok.suggestion.adaptations, 'cuidado com o joelho'); assert.strictEqual(ok.suggestion.customNotes, 'ok');
    const over = PL.sanitizeAiSuggestion({ protocolType: '42K', startWeek: 9, customSpeeds: { z2: 9, z3: 8, z4: 7, z5: 6 } }, a);
    assert.strictEqual(over.suggestion.protocolType, '5K'); assert.strictEqual(over.suggestion.startWeek, 1); assert.deepStrictEqual(over.suggestion.customSpeeds, PL.SPEED_PRESETS.iniciante);
    assert.ok(over.corrections.length >= 2 && over.corrections.some((c) => /42K/.test(c)) && over.corrections.some((c) => /velocidades/.test(c)));
    const adv = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 6 }, a); assert.strictEqual(adv.suggestion.startWeek, 1, 'a IA não entra adiantada'); assert.ok(adv.corrections.some((c) => /semana 6/.test(c)));
    const cautious = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 1 }, { runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', fitnessLevel: 3, canJog5min: true });
    assert.strictEqual(cautious.suggestion.startWeek, 1, 'IA mais cautelosa que as regras (5) vale');
    const strongA = { runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', fitnessLevel: 4, canJog5min: true, runningGoal: 'complete_10k' };
    const t10 = PL.sanitizeAiSuggestion({ protocolType: '10K', startWeek: 5 }, strongA); assert.strictEqual(t10.suggestion.protocolType, '10K'); assert.strictEqual(t10.suggestion.startWeek, 1, 'protocolo longo entra na semana 1'); assert.ok(t10.corrections.some((c) => /semana 5/.test(c)));
    const down = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 2 }, strongA); assert.strictEqual(down.suggestion.protocolType, '5K'); assert.strictEqual(down.suggestion.startWeek, 2, 'IA escolheu mais cauteloso: vale');
    const weird = PL.sanitizeAiSuggestion({ protocolType: 'ZZ', startWeek: 'abc', adaptations: 'null', customNotes: '  ' }, a);
    assert.strictEqual(weird.suggestion.protocolType, '5K'); assert.strictEqual(weird.suggestion.adaptations, null); assert.ok(/seu protocolo de 5K/.test(weird.suggestion.customNotes));
    assert.ok(weird.corrections.some((c) => /desconhecido/.test(c)) && weird.corrections.some((c) => /fora do formato/.test(c)));
    const empty = PL.sanitizeAiSuggestion(null, a); assert.strictEqual(empty.suggestion.protocolType, '5K'); assert.deepStrictEqual(empty.corrections, []);
    const long = PL.sanitizeAiSuggestion({ protocolType: '5K', customNotes: 'x'.repeat(5000) }, a); assert.strictEqual(long.suggestion.customNotes.length, 1500);
    assert.deepStrictEqual(PL.extractJson('```json\n{"a":1}\n```'), { a: 1 }); assert.deepStrictEqual(PL.extractJson('Claro! {"a":{"b":2}} pronto'), { a: { b: 2 } });
    assert.strictEqual(PL.extractJson('sem json'), null); assert.strictEqual(PL.extractJson('{quebrado'), null); assert.strictEqual(PL.extractJson('[1,2]'), null); assert.strictEqual(PL.extractJson(''), null);
  });

  // ───────────────────────── andamento por desempenho (contas puras) ─────────────────────────
  await block('andamento: semana aberta, com treinos feitos e dias que faltam', () => {
    const r0 = PR.resolveProgress(proto(), [], at(2)); assert.strictEqual(r0.changed, false);
    assert.deepStrictEqual([r0.view.week, r0.view.status, r0.view.doneKeys, r0.view.daysLeft, r0.view.pct, r0.view.overdue, r0.view.block, r0.view.totalWeeks], [1, 'ACTIVE', [], 5, 0, false, 1, 8]);
    const r1 = PR.resolveProgress(proto(), [lg('QUARTA', 1)], at(2)); assert.deepStrictEqual(r1.view.doneKeys, ['QUARTA']); assert.strictEqual(r1.view.pct, Math.round((1 / 3) / 8 * 100));
    const r2 = PR.resolveProgress(proto(), [lg('QUARTA', 1), lg('QUARTA', 1.5), lg('SEXTA', 2)], at(3)); assert.deepStrictEqual(r2.view.doneKeys, ['QUARTA', 'SEXTA'], 'o mesmo treino 2x conta uma vez');
    assert.strictEqual(PR.resolveProgress(proto(), [lg('QUARTA', 1)], at(7)).view.daysLeft, 0);
  });
  await block('andamento: semana concluída espera a próxima abrir (7 dias)', () => {
    const logs = [lg('QUARTA', 1), lg('SEXTA', 2), lg('DOMINGO', 3)];
    const r = PR.resolveProgress(proto(), logs, at(4));
    assert.deepStrictEqual([r.view.week, r.view.status, r.changed], [1, 'WEEK_DONE', false]);
    assert.strictEqual(r.view.unlocksAt!.getTime(), at(7).getTime());
    const next = PR.resolveProgress(proto(), logs, at(8));
    assert.deepStrictEqual([next.view.week, next.view.status, next.changed, next.view.doneKeys], [2, 'ACTIVE', true, []]);
    assert.strictEqual(next.next.weekOpenedAt.getTime(), at(7).getTime(), 'a semana nova abre alinhada (dia 7)');
    assert.strictEqual(next.next.progressNote, null);
  });
  await block('andamento: 2 de 3 treinos fecha a semana só depois dos 7 dias', () => {
    const logs = [lg('QUARTA', 1), lg('DOMINGO', 3)];
    assert.strictEqual(PR.resolveProgress(proto(), logs, at(5)).view.week, 1);
    const r = PR.resolveProgress(proto(), logs, at(8));
    assert.deepStrictEqual([r.view.week, r.changed], [2, true]); assert.ok(/2 de 3/.test(r.next.progressNote!)); assert.strictEqual(r.next.weekOpenedAt.getTime(), at(8).getTime(), 'fechou atrasado: relógio da nova semana começa agora');
    const one = PR.resolveProgress(proto(), [lg('QUARTA', 1)], at(10)); assert.deepStrictEqual([one.view.week, one.view.overdue, one.changed], [1, true, false], '1 de 3 não passa de semana');
    assert.strictEqual(one.view.status, 'ACTIVE');
  });
  await block('andamento: parar 14 dias volta uma semana (e nunca abaixo da 1)', () => {
    const w1 = PR.resolveProgress(proto(), [], at(15)); assert.deepStrictEqual([w1.view.week, w1.changed], [1, true]); assert.ok(/Recomeçando a semana 1/.test(w1.next.progressNote!)); assert.strictEqual(w1.next.weekOpenedAt.getTime(), at(15).getTime());
    const w3 = PR.resolveProgress(proto({ currentWeek: 3 }), [lg('QUARTA', 2)], at(15)); assert.deepStrictEqual([w3.view.week, w3.changed], [2, true]); assert.ok(/Voltamos para a semana 2/.test(w3.next.progressNote!));
    const ok = PR.resolveProgress(proto({ currentWeek: 3 }), [], at(13)); assert.deepStrictEqual([ok.view.week, ok.changed], [3, false], '13 dias ainda não volta');
    const two = PR.resolveProgress(proto({ currentWeek: 3 }), [lg('QUARTA', 2), lg('SEXTA', 3)], at(15)); assert.strictEqual(two.view.week, 4, '2 treinos feitos: não conta como parada, fecha e avança');
    // fechou a semana 3 inteira e sumiu 40 dias: avança para a 4 e, parada, volta para a 3
    const gone = PR.resolveProgress(proto({ currentWeek: 3 }), [lg('QUARTA', 1), lg('SEXTA', 2), lg('DOMINGO', 3)], at(40));
    assert.strictEqual(gone.view.week, 3); assert.ok(/Voltamos para a semana 3/.test(gone.next.progressNote!)); assert.strictEqual(gone.next.weekOpenedAt.getTime(), at(40).getTime());
  });
  await block('andamento: esforço muito alto (RPE médio ≥ 9) repete a semana uma vez', () => {
    const hard = [lg('QUARTA', 1, 9), lg('SEXTA', 2, 10), lg('DOMINGO', 3, 9)];
    const r = PR.resolveProgress(proto({ currentWeek: 2 }), hard, at(8));
    assert.deepStrictEqual([r.view.week, r.changed, r.next.lastRepeatWeek], [2, true, 2]); assert.ok(/repetida/.test(r.next.progressNote!) && /9,3/.test(r.next.progressNote!), r.next.progressNote!);
    assert.strictEqual(r.next.weekOpenedAt.getTime(), at(7).getTime());
    // na rodada repetida, de novo pesado: agora avança (não repete para sempre)
    const again = PR.resolveProgress(proto({ currentWeek: 2, weekOpenedAt: at(7), lastRepeatWeek: 2 }), [...hard, lg('QUARTA', 8, 10), lg('SEXTA', 9, 9), lg('DOMINGO', 10, 10)], at(15));
    assert.deepStrictEqual([again.view.week, again.next.lastRepeatWeek], [3, null]);
    const calm = PR.resolveProgress(proto({ currentWeek: 2 }), [lg('QUARTA', 1, 9), lg('SEXTA', 2, 9), lg('DOMINGO', 3, 8)], at(8)); assert.strictEqual(calm.view.week, 3, 'média 8,7 avança');
    const single = PR.resolveProgress(proto({ currentWeek: 2 }), [lg('QUARTA', 1, 10), lg('SEXTA', 2), lg('DOMINGO', 3)], at(8)); assert.strictEqual(single.view.week, 3, 'um RPE só não decide');
    const soft = PR.resolveProgress(proto({ currentWeek: 2 }), [lg('QUARTA', 1, 10), lg('SEXTA', 2, 10)], at(9)); assert.deepStrictEqual([soft.view.week, soft.next.weekOpenedAt.getTime()], [2, at(9).getTime()], 'fechamento parcial também repete');
  });
  await block('andamento: concluir = fazer a prova (DOMINGO da última semana)', () => {
    const base = proto({ currentWeek: 8, weekOpenedAt: at(0) });
    const race = PR.resolveProgress(base, [lg('DOMINGO', 5)], at(6));
    assert.deepStrictEqual([race.view.status, race.view.pct, race.changed, race.view.week], ['COMPLETED', 100, true, 8]); assert.strictEqual(race.next.completedAt!.getTime(), at(5).getTime());
    const stable = PR.resolveProgress({ ...base, ...race.next }, [lg('DOMINGO', 5)], at(30)); assert.deepStrictEqual([stable.view.status, stable.changed], ['COMPLETED', false]);
    const noRace = PR.resolveProgress(base, [lg('QUARTA', 1), lg('SEXTA', 2)], at(10)); assert.deepStrictEqual([noRace.view.status, noRace.view.week, noRace.changed], ['ACTIVE', 8, false], '2 treinos não encerram a última semana');
    const idle = PR.resolveProgress(base, [], at(15)); assert.strictEqual(idle.view.week, 7, 'parou 14 dias na última: volta uma');
    for (const [t, w] of [['10K', 10], ['21K', 12], ['42K', 16]] as const) { const r = PR.resolveProgress(proto({ protocolType: t, currentWeek: w }), [lg('DOMINGO', 2)], at(3)); assert.strictEqual(r.view.status, 'COMPLETED', t); assert.strictEqual(r.view.totalWeeks, w); }
    assert.strictEqual(PR.resolveProgress(proto({ protocolType: '10K', currentWeek: 8 }), [lg('DOMINGO', 2)], at(3)).view.status, 'ACTIVE', 'DOMINGO da semana 8 do 10K não conclui');
  });
  await block('andamento: protocolo antigo migra para o calendário sem recuar', () => {
    const old = { id: 'p1', protocolType: null, startWeek: 1, startDate: at(0), currentWeek: null, weekOpenedAt: null };
    const r = PR.resolveProgress(old, [], at(20)); assert.deepStrictEqual([r.view.week, r.changed], [3, true]); assert.ok(at(20).getTime() - r.next.weekOpenedAt.getTime() < 7 * DAY);
    const same = PR.legacyState(old, at(20)); assert.strictEqual(same.currentWeek, 3);
    const capped = PR.resolveProgress(old, [], at(100)); assert.strictEqual(capped.view.week, 8, 'não recua na primeira abertura'); assert.ok(at(100).getTime() - capped.next.weekOpenedAt.getTime() <= 6 * DAY);
    const mid = PR.resolveProgress({ ...old, startWeek: 3 }, [], at(15)); assert.strictEqual(mid.view.week, 5);
    const today = PR.resolveProgress(old, [], at(0)); assert.strictEqual(today.view.week, 1);
    const withLog = PR.resolveProgress(old, [lg('QUARTA', 14.5)], at(15)); assert.deepStrictEqual(withLog.view.doneKeys, ['QUARTA'], 'treino feito nesta semana do calendário conta');
  });
  await block('andamento: ignora treino de outro protocolo e corrida avulsa', () => {
    const r = PR.resolveProgress(proto(), [lg('QUARTA', 1, null, { protocolId: 'outro' }), lg('AVULSO', 1), lg('SEXTA', 1)], at(2));
    assert.deepStrictEqual(r.view.doneKeys, ['SEXTA']);
    const before = PR.resolveProgress(proto({ weekOpenedAt: at(2) }), [lg('QUARTA', 1)], at(3)); assert.deepStrictEqual(before.view.doneKeys, [], 'treino anterior à abertura da semana não conta');
  });
  await block('andamento: ações do coach (avançar, repetir, saltar)', () => {
    const p = proto({ currentWeek: 3 });
    const adv = PR.applyCoachAction(p, { action: 'advance' }, at(2))!; assert.deepStrictEqual([adv.currentWeek, adv.weekOpenedAt.getTime()], [4, at(2).getTime()]); assert.ok(/liberou a semana 4/.test(adv.progressNote!));
    const rep = PR.applyCoachAction(p, { action: 'repeat' }, at(2))!; assert.deepStrictEqual([rep.currentWeek, rep.lastRepeatWeek], [3, 3]);
    const set = PR.applyCoachAction({ ...p, completedAt: at(1) }, { action: 'set-week', week: 5 }, at(2))!; assert.deepStrictEqual([set.currentWeek, set.completedAt], [5, null]);
    assert.strictEqual(PR.applyCoachAction(p, { action: 'set-week', week: 9 }, at(2)), null); assert.strictEqual(PR.applyCoachAction(p, { action: 'set-week', week: 0 }, at(2)), null); assert.strictEqual(PR.applyCoachAction(p, { action: 'set-week', week: 2.5 as any }, at(2)), null);
    assert.strictEqual(PR.applyCoachAction(p, { action: 'set-week' } as any, at(2)), null); assert.strictEqual(PR.applyCoachAction(p, { action: 'xx' } as any, at(2)), null);
    const fin = PR.applyCoachAction(proto({ currentWeek: 8 }), { action: 'advance' }, at(2))!; assert.ok(fin.completedAt); assert.strictEqual(PR.applyCoachAction(proto({ currentWeek: 8, completedAt: at(1) }), { action: 'advance' }, at(2)), null);
    const ini = PR.initialPersisted('10K', 99, at(1)); assert.deepStrictEqual([ini.currentWeek, ini.completedAt, ini.lastRepeatWeek], [10, null, null]);
  });

  // ───────────────────────── rotas ─────────────────────────
  await block('GET: login, permissão e protocolo ausente (corridas avulsas aparecem)', async () => {
    assert.strictEqual((await call(userGET, '/x', null, {}, { params: { userId: 's1' } })).status, 401);
    assert.strictEqual((await call(userGET, '/x', tok('cB'), {}, { params: { userId: 's1' } })).status, 403, 'outro coach');
    assert.strictEqual((await call(userGET, '/x', tok('s2', 'USER', 'cB'), {}, { params: { userId: 's1' } })).status, 403, 'outro aluno');
    mkLog({ sessionDay: 'AVULSO', week: 0, block: 0, distanceKm: 3 });
    const mine = await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } });
    assert.deepStrictEqual([mine.status, mine.json.protocol, mine.json.logs.length], [200, null, 1]);
    assert.strictEqual((await call(userGET, '/x', tok('cA'), {}, { params: { userId: 's1' } })).status, 200); assert.strictEqual((await call(userGET, '/x', tok(PAULO_ID, 'ADMIN'), {}, { params: { userId: 's1' } })).status, 200);
  });
  await block('GET: protocolo com andamento, compatível com o app antigo, e migração do protocolo antigo', async () => {
    mkProto({ id: 'pOld', startWeek: 1, startDate: ago(16), currentWeek: null, weekOpenedAt: null, aiPromptSnapshot: 'ANAMNESE secreta' });
    mkLog({ protocolId: 'pOld', sessionDay: 'QUARTA', createdAt: ago(1) });
    const r = await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } });
    assert.strictEqual(r.status, 200); const j = r.json;
    assert.deepStrictEqual([j.currentWeek, j.currentBlock, j.progress.week, j.progress.doneKeys, j.progress.totalWeeks, j.progress.status], [3, 2, 3, ['QUARTA'], 8, 'ACTIVE']);
    assert.strictEqual(j.protocol.logs.length, 1); assert.strictEqual(j.logs.length, 1); assert.ok(!('aiPromptSnapshot' in j.protocol), 'o prompt da IA não vai para o app');
    const saved = S.runningProtocol.find((x: any) => x.id === 'pOld'); assert.strictEqual(saved.currentWeek, 3, 'gravou a migração'); assert.ok(saved.weekOpenedAt);
    const again = await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } }); assert.strictEqual(again.json.currentWeek, 3);
  });
  await block('GET: semana fechada avança sozinha e grava', async () => {
    mkProto({ id: 'p9', currentWeek: 2, weekOpenedAt: ago(9) });
    ['QUARTA', 'SEXTA', 'DOMINGO'].forEach((k, i) => mkLog({ protocolId: 'p9', sessionDay: k, createdAt: ago(8 - i) }));
    const r = await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } });
    assert.deepStrictEqual([r.json.currentWeek, r.json.progress.status], [3, 'ACTIVE']); assert.strictEqual(S.runningProtocol[0].currentWeek, 3);
  });
  await block('LOG: treino do protocolo é carimbado com a semana do servidor e devolve o andamento', async () => {
    mkProto({ id: 'p1', currentWeek: 4, weekOpenedAt: ago(1) });
    const r = await call(logPOST, '/x', asS1(), post({ userId: 's1', protocolId: 'qualquer', week: 1, block: 1, sessionDay: 'sexta', durationMinutes: '30', distanceKm: '3,5', avgPace: '8:34', rpe: 7, notes: 'ok' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const row = S.runningLog[0]; assert.deepStrictEqual([row.protocolId, row.week, row.block, row.sessionDay, row.durationMinutes, row.distanceKm, row.rpe], ['p1', 4, 2, 'SEXTA', 30, 3.5, 7]);
    assert.deepStrictEqual([r.json.progress.week, r.json.progress.doneKeys, r.json.currentWeek, r.json.currentBlock], [4, ['SEXTA'], 4, 2]);
  });
  await block('LOG: 3 treinos = semana concluída; depois dos 7 dias a próxima abre', async () => {
    mkProto({ id: 'p1', currentWeek: 1, weekOpenedAt: ago(3) });
    let r: any;
    for (const k of ['QUARTA', 'SEXTA', 'DOMINGO']) r = await call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: k, durationMinutes: 30, distanceKm: 3, rpe: 6 }));
    assert.deepStrictEqual([r.json.progress.status, r.json.progress.week, r.json.progress.doneKeys.length], ['WEEK_DONE', 1, 3]);
    S.runningProtocol[0].weekOpenedAt = ago(8); S.runningLog.forEach((l: any) => { l.createdAt = ago(5); });
    const g = await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } }); assert.deepStrictEqual([g.json.currentWeek, g.json.progress.doneKeys], [2, []]);
  });
  await block('LOG: corrida avulsa salva sem protocolo e com protocolo (não conta como treino da semana)', async () => {
    const a = await call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: 'AVULSO', durationMinutes: 20, distanceKm: 2.5 }));
    assert.strictEqual(a.status, 200, JSON.stringify(a.json)); assert.deepStrictEqual([S.runningLog[0].protocolId, S.runningLog[0].week, a.json.progress], [null, 0, null]);
    mkProto({ id: 'p1', currentWeek: 3, weekOpenedAt: ago(1) });
    const b = await call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: 'AVULSO', durationMinutes: 20, distanceKm: 2.5 }));
    assert.deepStrictEqual([b.status, S.runningLog[1].protocolId, S.runningLog[1].week, b.json.progress.doneKeys], [200, 'p1', 3, []]);
  });
  await block('LOG: validações e permissões', async () => {
    mkProto({ id: 'p1', currentWeek: 1, weekOpenedAt: ago(1) });
    const bad = async (o: any, as = asS1()) => (await call(logPOST, '/x', as, post({ userId: 's1', sessionDay: 'QUARTA', durationMinutes: 30, distanceKm: 3, ...o }))).status;
    assert.strictEqual(await bad({ sessionDay: 'SEGUNDA' }), 400); assert.strictEqual(await bad({ sessionDay: undefined }), 400); assert.strictEqual(await bad({ rpe: 11 }), 400); assert.strictEqual(await bad({ rpe: 0 }), 400);
    assert.strictEqual(await bad({ durationMinutes: -5 }), 400); assert.strictEqual(await bad({ distanceKm: 'abc' }), 400); assert.strictEqual(await bad({ distanceKm: 900 }), 400); assert.strictEqual(await bad({ durationMinutes: 5000 }), 400);
    assert.strictEqual(await bad({ rpe: '' }), 200, 'esforço é opcional'); assert.strictEqual(await bad({ durationMinutes: null, distanceKm: null }), 200);
    assert.strictEqual((await call(logPOST, '/x', null, post({ userId: 's1', sessionDay: 'QUARTA' }))).status, 401);
    assert.strictEqual(await bad({}, tok('s2', 'USER', 'cB')), 403); assert.strictEqual(await bad({}, tok('cB')), 403);
    assert.strictEqual(await bad({}, tok('cA')), 200, 'o coach pode registrar pelo aluno'); assert.strictEqual(await bad({ notes: 'x'.repeat(3000) }), 200); assert.strictEqual(S.runningLog[S.runningLog.length - 1].notes.length, 1000);
    assert.strictEqual((await call(logPOST, '/x', asS1(), { method: 'POST', body: 'nao json' })).status, 400);
    S.runningProtocol.length = 0;
    assert.strictEqual(await bad({ sessionDay: 'SEXTA' }), 400, 'treino do protocolo sem protocolo ativo');
  });
  await block('LOG: protocolo concluído não aceita mais treino; avulsa continua', async () => {
    mkProto({ id: 'p1', currentWeek: 8, weekOpenedAt: ago(2) });
    const race = await call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: 'DOMINGO', durationMinutes: 40, distanceKm: 5, rpe: 8 }));
    assert.deepStrictEqual([race.status, race.json.progress.status, race.json.progress.pct], [200, 'COMPLETED', 100]); assert.ok(S.runningProtocol[0].completedAt, 'gravou a conclusão');
    const more = await call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: 'QUARTA', durationMinutes: 20 })); assert.strictEqual(more.status, 400); assert.ok(/concluído/.test(more.json.error));
    assert.strictEqual((await call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: 'AVULSO', durationMinutes: 20 }))).status, 200);
  });
  await block('PROTOCOLO: só o coach dono ou o master ativa; aluno não ativa para si', async () => {
    const body = { userId: 's1', protocolType: '5K', startWeek: 1 };
    assert.strictEqual((await call(protoPOST, '/x', null, post(body))).status, 401);
    assert.strictEqual((await call(protoPOST, '/x', asS1(), post(body))).status, 403, 'aluno ativando o próprio protocolo');
    assert.strictEqual((await call(protoPOST, '/x', tok('cB'), post(body))).status, 403);
    assert.strictEqual((await call(protoPOST, '/x', tok('cA'), post({ ...body, userId: 'nao-existe' }))).status, 404);
    assert.strictEqual((await call(protoPOST, '/x', tok('cA'), post(body))).status, 200);
    assert.strictEqual((await call(protoPOST, '/x', tok(PAULO_ID, 'ADMIN'), post({ ...body, userId: 's2' }))).status, 200, 'master em qualquer aluno');
    assert.strictEqual((await call(protoPOST, '/x', tok('cA'), { method: 'POST', body: 'x' })).status, 400);
    assert.strictEqual((await call(protoPOST, '/x', tok('cA'), post({}))).status, 400);
    assert.strictEqual((await call(protoPOST, '/x', tok('cA'), post({ userId: 'so' }))).status, 403, 'aluno sem coach: só master');
  });
  await block('PROTOCOLO: cria com tipo, dias, andamento inicial; bloco vem da semana; desativa o anterior', async () => {
    mkProto({ id: 'velho' });
    const r = await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', protocolType: '10K', startWeek: 3, trainingDays: ['ter', 'qui', 'SÁB'], customSpeeds: { z2: 7, z3: 7.6, z4: 8.6, z5: 9.6 }, customNotes: '  atenção  ', adaptations: '', generatedByAI: true, aiPromptSnapshot: 'p' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); const p = r.json.protocol;
    assert.deepStrictEqual([p.name, p.protocolType, p.startWeek, p.startBlock, p.currentWeek, p.trainingDays, p.customNotes, p.adaptations, p.generatedByAI, p.isActive, p.aiPromptSnapshot], ['Protocolo 10K', '10K', 3, 2, 3, ['TER', 'QUI', 'SAB'], 'atenção', null, true, true, 'p']);
    assert.ok(p.weekOpenedAt); assert.strictEqual(S.runningProtocol.find((x: any) => x.id === 'velho').isActive, false);
    const g = await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } }); assert.deepStrictEqual([g.json.currentWeek, g.json.progress.type, g.json.progress.totalWeeks], [3, '10K', 10]);
    const noAi = await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', generatedByAI: false, aiPromptSnapshot: 'p' })); assert.strictEqual(noAi.json.protocol.aiPromptSnapshot, null); assert.strictEqual(noAi.json.protocol.generatedByAI, false); assert.deepStrictEqual(noAi.json.warnings, [], '5K sem anamnese não avisa nada');
  });
  await block('PROTOCOLO: app antigo (só bloco) e validações', async () => {
    const blk = await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', startBlock: 3 })); assert.deepStrictEqual([blk.json.protocol.startWeek, blk.json.protocol.currentWeek, blk.json.protocol.protocolType], [5, 5, '5K']);
    const bad = async (o: any) => (await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', ...o }))).status;
    assert.strictEqual(await bad({ protocolType: '15K' }), 400); assert.strictEqual(await bad({ startWeek: 9 }), 400); assert.strictEqual(await bad({ startWeek: 0 }), 400); assert.strictEqual(await bad({ startWeek: 'x' }), 400);
    assert.strictEqual(await bad({ protocolType: '10K', startWeek: 10 }), 200); assert.strictEqual(await bad({ protocolType: '42K', startWeek: 16 }), 200); assert.strictEqual(await bad({ protocolType: '42K', startWeek: 17 }), 400);
    assert.strictEqual(await bad({ trainingDays: ['SEG', 'SEG', 'QUA'] }), 400); assert.strictEqual(await bad({ trainingDays: ['SEG', 'QUA'] }), 400); assert.strictEqual(await bad({ trainingDays: [] }), 200);
    assert.strictEqual(await bad({ customSpeeds: { z2: 9, z3: 8, z4: 7, z5: 6 } }), 400); assert.strictEqual(await bad({ customSpeeds: null }), 200); assert.strictEqual(await bad({ customNotes: 5 }), 400); assert.strictEqual(await bad({ adaptations: {} }), 400);
    const long = await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', customNotes: 'y'.repeat(5000) })); assert.strictEqual(long.json.protocol.customNotes.length, 2000);
  });
  await block('PROTOCOLO: avisa (sem bloquear) quando a anamnese não sustenta o tipo', async () => {
    const none = await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', protocolType: '21K' })); assert.strictEqual(none.status, 200); assert.ok(none.json.warnings.some((w: string) => /Sem anamnese/.test(w)));
    anam();
    const weak = await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', protocolType: '21K' })); assert.strictEqual(weak.status, 200); assert.ok(weak.json.warnings.some((w: string) => /ainda não tem base para o 21K/.test(w)));
    const ok = await call(protoPOST, '/x', tok('cA'), post({ userId: 's1', protocolType: '5K' })); assert.deepStrictEqual(ok.json.warnings, []);
  });
  await block('PATCH: ajusta notas, velocidades e dias sem mexer no andamento', async () => {
    mkProto({ id: 'p1', currentWeek: 4, weekOpenedAt: ago(2), customNotes: 'antigo', customSpeeds: { z2: 7.5, z3: 8, z4: 9, z5: 10 } });
    const r = await call(protoPATCH, '/x', tok('cA'), patch({ userId: 's1', customNotes: 'novo', trainingDays: ['SEG', 'QUA', 'SAB'], customSpeeds: { z2: 7, z3: 7.6, z4: 8.6, z5: 9.6 } }));
    assert.strictEqual(r.status, 200); const p = S.runningProtocol[0]; assert.deepStrictEqual([p.customNotes, p.trainingDays, p.customSpeeds.z2, p.currentWeek], ['novo', ['SEG', 'QUA', 'SAB'], 7, 4]);
    assert.strictEqual((await call(protoPATCH, '/x', tok('cA'), patch({ userId: 's1', customSpeeds: null }))).status, 200); assert.strictEqual(S.runningProtocol[0].customSpeeds, null);
    assert.strictEqual((await call(protoPATCH, '/x', tok('cA'), patch({ userId: 's1', customNotes: '' }))).status, 200); assert.strictEqual(S.runningProtocol[0].customNotes, null);
    for (const bad of [{ trainingDays: ['SEG'] }, { customSpeeds: { z2: 1 } }, { customNotes: 3 }, { adaptations: [] }, {}]) assert.strictEqual((await call(protoPATCH, '/x', tok('cA'), patch({ userId: 's1', ...bad }))).status, 400, JSON.stringify(bad));
    assert.strictEqual((await call(protoPATCH, '/x', asS1(), patch({ userId: 's1', customNotes: 'eu' }))).status, 403, 'aluno não ajusta');
    assert.strictEqual((await call(protoPATCH, '/x', tok('cB'), patch({ userId: 's1', customNotes: 'x' }))).status, 403);
    S.runningProtocol.length = 0; assert.strictEqual((await call(protoPATCH, '/x', tok('cA'), patch({ userId: 's1', customNotes: 'x' }))).status, 404);
  });
  await block('PROGRESSO (coach): avançar, repetir, saltar e proteções', async () => {
    mkProto({ id: 'p1', currentWeek: 3, weekOpenedAt: ago(1) });
    const act = (o: any, as = tok('cA')) => call(progPOST, '/x', as, post(o), { params: { userId: 's1' } });
    const adv = await act({ action: 'advance' }); assert.deepStrictEqual([adv.status, adv.json.progress.week], [200, 4]); assert.ok(/liberou a semana 4/.test(S.runningProtocol[0].progressNote));
    const rep = await act({ action: 'repeat' }); assert.deepStrictEqual([rep.json.progress.week, S.runningProtocol[0].lastRepeatWeek], [4, 4]);
    const set = await act({ action: 'set-week', week: 7 }); assert.strictEqual(set.json.progress.week, 7);
    const w9 = await act({ action: 'set-week', week: 9 }); assert.deepStrictEqual([w9.status, w9.json.error], [400, 'Semana inválida para esse protocolo.']); const voar = await act({ action: 'voar' }); assert.deepStrictEqual([voar.status, /advance, repeat ou set-week/.test(voar.json.error)], [400, true]); assert.strictEqual((await act({ action: 'set-week' })).status, 400);
    assert.strictEqual((await act({ action: 'advance' }, asS1())).status, 403, 'aluno não mexe no próprio andamento'); assert.strictEqual((await act({ action: 'advance' }, tok('cB'))).status, 403); assert.strictEqual((await act({ action: 'advance' }, null as any)).status, 401);
    await act({ action: 'set-week', week: 8 }); const fin = await act({ action: 'advance' }); assert.deepStrictEqual([fin.status, fin.json.progress.status], [200, 'COMPLETED']);
    const again = await act({ action: 'advance' }); assert.deepStrictEqual([again.status, again.json.error], [400, 'O protocolo já foi concluído.']);
    const back = await act({ action: 'set-week', week: 5 }); assert.deepStrictEqual([back.json.progress.status, back.json.progress.week], ['ACTIVE', 5], 'reabre o protocolo');
    S.runningProtocol.length = 0; assert.strictEqual((await act({ action: 'advance' })).status, 404);
    assert.strictEqual((await call(progPOST, '/x', tok('cA'), post({ action: 'advance' }), { params: { userId: 'xx' } })).status, 404);
  });
  await block('PROGRESSO (coach): não conta duas vezes uma semana que já fechou sozinha', async () => {
    mkProto({ id: 'p1', currentWeek: 2, weekOpenedAt: ago(9) });
    ['QUARTA', 'SEXTA', 'DOMINGO'].forEach((k, i) => mkLog({ protocolId: 'p1', sessionDay: k, createdAt: ago(8 - i) }));
    const r = await call(progPOST, '/x', tok('cA'), post({ action: 'advance' }), { params: { userId: 's1' } });
    assert.strictEqual(r.json.progress.week, 4, 'fechou sozinha (3) e o coach liberou mais uma (4)');
  });
  await block('GERAR: todo coach recebe a sugestão por regras, sem chamar a IA', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'; llm(() => { throw new Error('não devia chamar'); }); anam({ availableDays: ['TER', 'QUI', 'DOM'] });
    const r = await call(genPOST, '/x', tok('cA'), post({ userId: 's1' })); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual([r.json.source, (globalThis as any).__llmCalls, r.json.suggestion.protocolType, r.json.suggestion.startWeek, r.json.suggestion.trainingDays, r.json.promptSnapshot], ['rules', 0, '5K', 1, ['TER', 'QUI', 'DOM'], null]);
    assert.ok(r.json.eligibleTypes.includes('5K') && Array.isArray(r.json.warnings) && r.json.suggestion.customSpeeds.z2 > 0);
    assert.strictEqual(r.json.suggestion.warnings, undefined);
  });
  await block('GERAR: validações e permissões', async () => {
    assert.strictEqual((await call(genPOST, '/x', tok('cA'), post({ userId: 's1' }))).status, 400, 'anamnese não preenchida'); anam();
    assert.strictEqual((await call(genPOST, '/x', null, post({ userId: 's1' }))).status, 401); assert.strictEqual((await call(genPOST, '/x', asS1(), post({ userId: 's1' }))).status, 403); assert.strictEqual((await call(genPOST, '/x', tok('cB'), post({ userId: 's1' }))).status, 403);
    assert.strictEqual((await call(genPOST, '/x', tok('cA'), post({}))).status, 400); assert.strictEqual((await call(genPOST, '/x', tok('cA'), post({ userId: 'zz' }))).status, 404);
    S.runningAnamnese[0].filled = false; assert.strictEqual((await call(genPOST, '/x', tok('cA'), post({ userId: 's1' }))).status, 400);
  });
  await block('GERAR (master): usa a IA, confere a resposta e corrige o que a anamnese não sustenta', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'; anam();
    llm(() => aiText({ protocolType: '42K', startWeek: 9, customSpeeds: { z2: 7, z3: 7.6, z4: 8.6, z5: 9.6 }, adaptations: 'cuidar do joelho', customNotes: 'comece devagar' }));
    const r = await call(genPOST, '/x', tok(PAULO_ID, 'ADMIN'), post({ userId: 's1' })); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual([r.json.source, (globalThis as any).__llmCalls, r.json.suggestion.protocolType, r.json.suggestion.startWeek, r.json.suggestion.adaptations, r.json.suggestion.customNotes], ['ai', 1, '5K', 1, 'cuidar do joelho', 'comece devagar']);
    assert.ok(r.json.corrections.some((c: string) => /42K/.test(c)), JSON.stringify(r.json.corrections)); assert.ok(/ANAMNESE/.test(r.json.promptSnapshot) && /PROTOCOLOS DISPONÍVEIS/.test(r.json.promptSnapshot));
    assert.ok(/QUE O HISTÓRICO DESTE ALUNO SUSTENTA: 5K\./.test(r.json.promptSnapshot), 'o prompt só oferece o que é elegível');
  });
  await block('TOM: o que a aluna lê é escrito PARA ela; o que é do coach fica à parte', async () => {
    // o texto real que a IA devolveu antes (escrito para o coach, sobre "o aluno")
    const REAL = 'Aluno parado há mais de 1 ano, porém com histórico prévio de corrida acima de 5 km. ATENÇÃO: aluno não consultou médico — recomendação forte para avaliação médica.';
    for (const t of [REAL, 'a aluna deve procurar o médico', 'Os alunos iniciantes', 'Paciente com lesão', 'cliente sem liberação', 'ALUNO parado']) assert.strictEqual(PL.speaksAboutStudent(t), true, t);
    for (const t of ['Você está começando do zero.', 'Bora treinar! Qualquer dúvida me chame.', 'alunado', 'Seu coach acompanha cada semana.', '']) assert.strictEqual(PL.speaksAboutStudent(t), false, t);
    // as regras nunca falam sobre a pessoa nem trazem aviso clínico no texto da aluna
    const profiles = [{}, { runningExperience: 'never' }, { runningExperience: 'stopped', maxDistanceBefore: '3 a 5km', canJog5min: true, fitnessLevel: 3 }, { runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', fitnessLevel: 4, canJog5min: true, runningGoal: 'complete_10k', heartCondition: true, medicalClearance: 'no', injuries: ['Tornozelo'], jointIssues: true, bodyPainDuringWalk: 'dor no tornozelo' }];
    for (const a of profiles) {
      const sg = PL.suggestByRules(a);
      for (const t of [sg.customNotes, sg.adaptations || '']) { assert.strictEqual(PL.speaksAboutStudent(t), false, t); assert.ok(!/liberação médica|cardíaca|Sugestão automática/i.test(t), t); }
      assert.ok(sg.customNotes.includes('Você') && sg.customNotes.includes(`protocolo de ${sg.protocolType}`), sg.customNotes);
    }
    assert.ok(/semana 5/.test(PL.suggestByRules({ runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', fitnessLevel: 3, canJog5min: true }).customNotes), 'cita a semana de entrada');
    assert.ok(/semana 1/.test(PL.suggestByRules({ runningExperience: 'never' }).customNotes));
    const care = PL.suggestByRules(profiles[3]).adaptations!; assert.ok(/Tornozelo/.test(care) && /articular/.test(care) && /dor ao caminhar/.test(care) && !/dor no tornozelo/.test(care), 'não repete o texto livre da anamnese');
    assert.strictEqual(PL.suggestByRules(profiles[0]).adaptations, null);
    // frases do recado por perfil + a regra de segurança sempre presente
    const nt = (a: any) => PL.suggestByRules(a).customNotes;
    assert.ok(/começando do zero/.test(nt({ runningExperience: 'never' })) && !/já correu antes|já corre/.test(nt({ runningExperience: 'never' })));
    assert.ok(/já correu antes/.test(nt({ runningExperience: 'stopped', maxDistanceBefore: '3 a 5km', canJog5min: true, fitnessLevel: 3 })));
    assert.ok(/Você já corre,/.test(nt({ runningExperience: 'active', maxDistanceBefore: '1 a 2km', weeklyFrequencyNow: '1', fitnessLevel: 3, canJog5min: true })));
    assert.ok(!/começando do zero|já correu antes|já corre/.test(nt({})), 'sem perfil não inventa');
    for (const a of profiles) assert.ok(/pare e me avise/.test(nt(a)) && /conseguindo conversar/.test(nt(a)), 'regra de segurança no recado');
    // cuidados: cada motivo sozinho, e o texto completo
    assert.ok(/\(problema articular\)/.test(PL.suggestByRules({ jointIssues: true }).adaptations!), 'só articular');
    assert.ok(/\(dor ao caminhar\)/.test(PL.suggestByRules({ bodyPainDuringWalk: 'x' }).adaptations!), 'só dor');
    assert.ok(/\(lesão \(Joelho, Ombro\)\)/.test(PL.suggestByRules({ injuries: ['Nenhuma', 'Joelho', 'Ombro'] }).adaptations!), 'só lesão, sem "Nenhuma"');
    assert.strictEqual(PL.suggestByRules({ injuries: ['Nenhuma'] }).adaptations, null, '"Nenhuma" não é lesão');
    assert.strictEqual(PL.suggestByRules({ jointIssues: true }).adaptations, 'Cuidados para o seu treino (problema articular): prefira esteira ou piso plano e regular, faça um aquecimento articular antes de cada sessão e, se a dor passar de 3 em 10, reduza o ritmo ou pare e me avise.');
    // a IA escolheu OUTRA semana que as regras: o recado padrão cita a semana FINAL, não a das regras
    const midA = { runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', fitnessLevel: 3, canJog5min: true };
    assert.strictEqual(PL.suggestByRules(midA).startWeek, 5);
    const lower = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 1, customNotes: 'O aluno parado há 1 ano.' }, midA);
    assert.strictEqual(lower.suggestion.startWeek, 1); assert.ok(/semana 1,/.test(lower.suggestion.customNotes) && !/semana 5/.test(lower.suggestion.customNotes), lower.suggestion.customNotes);
    const noText = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 2 }, midA); assert.ok(/semana 2\./.test(noText.suggestion.customNotes), 'sem texto da IA: padrão com a semana final');
    // IA escreveu "sobre o aluno": entra o texto padrão e o coach é avisado
    const bad = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 1, adaptations: 'Aluno com lesão no tornozelo: aquecer.', customNotes: REAL, coachNotes: 'Sem liberação médica: pedir atestado.' }, profiles[1]);
    assert.ok(/seu protocolo de 5K/.test(bad.suggestion.customNotes) && !/Aluno/.test(bad.suggestion.customNotes));
    assert.strictEqual(bad.suggestion.adaptations, null, 'sem lesão na anamnese o padrão é nenhum');
    assert.ok(bad.corrections.some((c) => /recado/.test(c)) && bad.corrections.some((c) => /adaptações/.test(c)), JSON.stringify(bad.corrections));
    assert.strictEqual(bad.coachNotes, 'Sem liberação médica: pedir atestado.', 'a análise para o coach não vai para a aluna');
    assert.notStrictEqual(bad.suggestion.customNotes, 'Sem liberação médica: pedir atestado.');
    const injured = PL.sanitizeAiSuggestion({ adaptations: 'Aluno com lesão.' }, profiles[3]); assert.ok(/Tornozelo/.test(injured.suggestion.adaptations!), 'adaptação trocada pelo padrão da anamnese');
    // texto bom da IA (para a aluna) passa intacto; coachNotes ausente/nulo/vazio vira null; limite de tamanho
    const good = PL.sanitizeAiSuggestion({ customNotes: 'Oi! Vamos começar devagar. Você vai se surpreender.', adaptations: 'Aqueça o tornozelo antes.', coachNotes: '  ' }, profiles[1]);
    assert.deepStrictEqual([good.suggestion.customNotes, good.suggestion.adaptations, good.coachNotes, good.corrections], ['Oi! Vamos começar devagar. Você vai se surpreender.', 'Aqueça o tornozelo antes.', null, []]);
    assert.strictEqual(PL.sanitizeAiSuggestion({ coachNotes: 'null' }, {}).coachNotes, null); assert.strictEqual(PL.sanitizeAiSuggestion({ coachNotes: 'x'.repeat(4000) }, {}).coachNotes!.length, 1500); assert.strictEqual(PL.sanitizeAiSuggestion({ coachNotes: 5 }, {}).coachNotes, null);
    // pela rota: o master recebe coachNotes à parte e o prompt manda escrever para a pessoa
    process.env.ANTHROPIC_API_KEY = 'k'; anam();
    llm(() => aiText({ protocolType: '5K', startWeek: 1, customSpeeds: { z2: 7, z3: 7.6, z4: 8.6, z5: 9.6 }, adaptations: null, customNotes: REAL, coachNotes: 'Sem liberação médica.' }));
    const r = await call(genPOST, '/x', tok(PAULO_ID, 'ADMIN'), post({ userId: 's1' })); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(!/Aluno/.test(r.json.suggestion.customNotes) && /seu protocolo de 5K/.test(r.json.suggestion.customNotes)); assert.strictEqual(r.json.coachNotes, 'Sem liberação médica.'); assert.strictEqual(r.json.suggestion.coachNotes, undefined, 'coachNotes não vai nos campos do protocolo');
    assert.ok(/serão LIDOS PELA PRÓPRIA PESSOA/.test(r.json.promptSnapshot) && /NUNCA use as palavras "aluno"/.test(r.json.promptSnapshot) && /"coachNotes"/.test(r.json.promptSnapshot));
    assert.ok(r.json.corrections.some((c: string) => /recado/.test(c)));
    // coach comum (regras): sem coachNotes
    const rr = await call(genPOST, '/x', tok('cA'), post({ userId: 's1' })); assert.strictEqual(rr.json.coachNotes, null);
  });
  await block('GERAR (master): IA fora do formato, com erro ou sem chave cai nas regras', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'; anam();
    for (const mode of ['lixo', 'erro', 'array']) {
      llm(() => mode === 'erro' ? new Error('rede caiu') : { content: [{ type: 'text', text: mode === 'lixo' ? 'Claro! Aqui vai o protocolo.' : '[1,2]' }] });
      const r = await call(genPOST, '/x', tok(PAULO_ID, 'ADMIN'), post({ userId: 's1' })); assert.strictEqual(r.status, 200, mode); assert.strictEqual(r.json.source, 'rules', mode); assert.ok(/regras/.test(r.json.fallbackReason), mode); assert.strictEqual(r.json.suggestion.protocolType, '5K');
    }
    llm(() => { throw new Error('não devia chamar'); }); delete process.env.ANTHROPIC_API_KEY; (globalThis as any).__llmCalls = 0;
    const nokey = await call(genPOST, '/x', tok(PAULO_ID, 'ADMIN'), post({ userId: 's1' })); assert.strictEqual(nokey.json.source, 'rules'); assert.strictEqual((globalThis as any).__llmCalls, 0);
  });
  await block('GERAR (master): IA válida de corredor experiente (10K) passa sem correção', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    anam({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', fitnessLevel: 4, canJog5min: true, runningGoal: 'complete_10k', availableDays: ['TER', 'QUI', 'SÁB', 'DOM'] });
    llm(() => aiText({ protocolType: '10K', startWeek: 1, customSpeeds: { z2: 8.5, z3: 9.3, z4: 10.5, z5: 11.8 }, adaptations: null, customNotes: 'bom nível' }, false));
    const r = await call(genPOST, '/x', tok(PAULO_ID, 'ADMIN'), post({ userId: 's1' }));
    assert.deepStrictEqual([r.json.source, r.json.corrections, r.json.suggestion.protocolType, r.json.eligibleTypes], ['ai', [], '10K', ['5K', '10K']]); assert.strictEqual(r.json.suggestion.trainingDays[2], 'DOM');
  });


  // ───────────────────────── notificações (fase 1) ─────────────────────────
  const view = (o: any = {}) => ({ type: '5K', week: 2, totalWeeks: 8, block: 1, status: 'ACTIVE', doneKeys: ['QUARTA', 'SEXTA'], sessionsPerWeek: 3, openedAt: at(0), unlocksAt: null, daysLeft: 4, overdue: false, avgRpe: 7, note: null, completedAt: null, pct: 20, ...o });
  await block('push: textos — coach recebe o resumo, aluna recebe frase curta e acolhedora', () => {
    const m = RM.anamneseCoachMessage('Marcela Silva', { runningGoal: 'complete_5k', medicalClearance: 'not_consulted', heartCondition: false, injuries: ['Nenhuma'] });
    assert.deepStrictEqual([m.title, m.body], ['Marcela respondeu a anamnese de corrida', 'Objetivo: Completar 5 km. ⚠ sem liberação médica. Toque para montar o protocolo.']);
    const full = RM.anamneseCoachMessage('', { runningGoal: 'zzz', heartCondition: true, medicalClearance: 'no', injuries: ['Joelho'] });
    assert.deepStrictEqual([full.title, full.body], ['Seu aluno respondeu a anamnese de corrida', '⚠ condição cardíaca, sem liberação médica, lesão informada. Toque para montar o protocolo.']);
    assert.strictEqual(RM.anamneseCoachMessage('Ana', { medicalClearance: 'yes', injuries: ['Nenhuma'] }).body, 'Toque para montar o protocolo.');
    const p1 = RM.protocolStudentMessage('Marcela Silva', '5K', 1, ['TER', 'SEX', 'DOM'], false);
    assert.deepStrictEqual([p1.title, p1.body], ['Seu protocolo de corrida está pronto 🏃', 'Marcela, seu plano de 5K começa na semana 1 · treinos: ter, sex e dom. Toque para ver.']);
    const p2 = RM.protocolStudentMessage(null, '10K', 3, [], true); assert.deepStrictEqual([p2.title, p2.body], ['Seu novo protocolo de corrida está pronto 🏃', 'Seu plano de 10K começa na semana 3. Toque para ver.']);
    assert.ok(!/·/.test(RM.protocolStudentMessage('A', '5K', 1, ['TER', 'XX', 'DOM']).body), 'dias inválidos não aparecem'); assert.ok(/sáb/.test(RM.protocolStudentMessage('A', '5K', 1, ['TER', 'SÁB', 'DOM']).body));
    for (const t of [p1.body, p2.body, p1.title]) assert.ok(!/alun[oa]|liberação|médic/i.test(t), 'nada clínico nem "aluno" no texto da aluna: ' + t);
  });
  await block('push: o que o treino mudou no andamento (só mudanças, nada repetido)', () => {
    const pm = (b: any, a: any) => RM.progressCoachMessage('Marcela Silva', view(b) as any, view(a) as any);
    const wd = pm({ status: 'ACTIVE' }, { status: 'WEEK_DONE', doneKeys: ['QUARTA', 'SEXTA', 'DOMINGO'], daysLeft: 4, avgRpe: 7.5 })!;
    assert.deepStrictEqual([wd.kind, wd.title, wd.body], ['week_done', 'Marcela fechou a semana 2 de 8', '3 de 3 treinos · esforço médio 7,5. A semana 3 libera em 4 dias.']);
    assert.strictEqual(pm({ status: 'ACTIVE' }, { status: 'WEEK_DONE', doneKeys: ['QUARTA', 'SEXTA', 'DOMINGO'], daysLeft: 1, avgRpe: null })!.body, '3 de 3 treinos. A semana 3 libera em 1 dia.');
    assert.ok(/libera em 1 dia\./.test(pm({ status: 'ACTIVE' }, { status: 'WEEK_DONE', daysLeft: 0 })!.body), 'nunca "0 dias"');
    const done = pm({ status: 'ACTIVE', week: 8 }, { status: 'COMPLETED', week: 8 })!; assert.deepStrictEqual([done.kind, done.title, done.body], ['completed', 'Marcela concluiu o protocolo de 5K! 🏁', 'Hora de escolher o próximo desafio. Toque para abrir.']);
    assert.strictEqual(pm({ status: 'WEEK_DONE', week: 3 }, { status: 'COMPLETED', week: 3 })!.kind, 'completed');
    const adv = pm({ week: 2 }, { week: 3, note: 'Semana 2 fechada com 2 de 3 treinos. Seguimos para a semana 3.' })!; assert.deepStrictEqual([adv.kind, adv.title, adv.body], ['advanced', 'Marcela avançou para a semana 3 de 8', 'Semana 2 fechada com 2 de 3 treinos. Seguimos para a semana 3.']);
    assert.strictEqual(pm({ week: 2 }, { week: 3, note: null })!.body, 'A semana 2 foi fechada.');
    const rep = pm({ week: 2, openedAt: at(0) }, { week: 2, openedAt: at(8), note: 'Semana 2 repetida: o esforço médio foi 9,3 de 10 (muito pesado). Vamos consolidar antes de subir.' })!; assert.deepStrictEqual([rep.kind, rep.title], ['repeat', 'Marcela vai repetir a semana 2']); assert.ok(/9,3/.test(rep.body));
    // nada de novo: 2º treino, 4º treino depois de fechada, concluído que continua concluído, protocolo recém aberto
    assert.strictEqual(pm({ status: 'ACTIVE', doneKeys: ['QUARTA'] }, { status: 'ACTIVE', doneKeys: ['QUARTA', 'SEXTA'] }), null);
    assert.strictEqual(pm({ status: 'WEEK_DONE' }, { status: 'WEEK_DONE' }), null); assert.strictEqual(pm({ status: 'COMPLETED' }, { status: 'COMPLETED' }), null);
    assert.strictEqual(pm({ status: 'ACTIVE' }, { status: 'ACTIVE', openedAt: at(0) }), null, 'mesmo relógio da semana = nada mudou');
    assert.strictEqual(pm({ week: 3, openedAt: at(0) }, { week: 2, openedAt: at(8) }), null, 'voltar uma semana por inatividade não é conquista do treino (mesmo com o relógio reaberto)');
    assert.strictEqual(pm({ status: 'WEEK_DONE', openedAt: at(0) }, { status: 'WEEK_DONE', openedAt: at(8) }), null, 'semana fechada com relógio reaberto: não é "repetir"');
    assert.strictEqual(pm({ week: 3 }, { week: 2 }), null);
    assert.strictEqual(RM.progressCoachMessage(null, view() as any, view({ status: 'COMPLETED' }) as any)!.title, 'Seu aluno concluiu o protocolo de 5K! 🏁');
  });
  await block('push: anamnese respondida avisa o coach dono, uma vez só, sem segurar a resposta', async () => {
    S.runningAnamnese.push({ id: 'an1', userId: 's1', token: 'tk1', filled: false }); S.user.find((u: any) => u.id === 's1').name = 'Marcela Silva';
    const body = { runningExperience: 'never', runningGoal: 'complete_5k', medicalClearance: 'not_consulted', injuries: ['Nenhuma'], availableDays: ['TER', 'SEX', 'DOM'] };
    const r = await call(anamPOST, '/x', null, post(body), { params: { token: 'tk1' } }); assert.strictEqual(r.status, 200, JSON.stringify(r.json)); await settle();
    assert.strictEqual(pushes().length, 1, JSON.stringify(pushes()));
    assert.deepStrictEqual([pushes()[0].to, pushes()[0].title, pushes()[0].data], ['cA', 'Marcela respondeu a anamnese de corrida', { type: 'running_anamnese', studentId: 's1' }]);
    assert.ok(/⚠ sem liberação médica/.test(pushes()[0].body));
    // reenviar o formulário não avisa de novo
    await call(anamPOST, '/x', null, post(body), { params: { token: 'tk1' } }); await settle(); assert.strictEqual(pushes().length, 1);
    // token inválido: 404 e nada enviado; aluno sem coach: salva e não avisa; push fora do ar não quebra a resposta
    assert.strictEqual((await call(anamPOST, '/x', null, post(body), { params: { token: 'nope' } })).status, 404);
    S.runningAnamnese.push({ id: 'an2', userId: 'so', token: 'tk2', filled: false }); clearPushes();
    assert.strictEqual((await call(anamPOST, '/x', null, post(body), { params: { token: 'tk2' } })).status, 200); await settle(); assert.strictEqual(pushes().length, 0, 'sem coach não há quem avisar');
    S.runningAnamnese.push({ id: 'an3', userId: 's2', token: 'tk3', filled: false }); (globalThis as any).__pushFail = true;
    const down = await call(anamPOST, '/x', null, post(body), { params: { token: 'tk3' } }); await settle(); assert.strictEqual(down.status, 200); assert.strictEqual(S.runningAnamnese.find((a: any) => a.id === 'an3').filled, true, 'a anamnese foi salva mesmo com o push fora do ar');
    // coach do aluno é o master: ele recebe
    clearPushes(); S.runningAnamnese.push({ id: 'an4', userId: 'sm', token: 'tk4', filled: false }); await call(anamPOST, '/x', null, post(body), { params: { token: 'tk4' } }); await settle(); assert.deepStrictEqual(pushes().map((p: any) => p.to), [PAULO_ID]);
  });
  await block('push: o treino que fecha a semana, repete, avança ou conclui avisa o coach; o resto não', async () => {
    S.user.find((u: any) => u.id === 's1').name = 'Marcela Silva';
    const p = mkProto({ id: 'p1', currentWeek: 2, weekOpenedAt: ago(2) });
    const log = (day: string, as = asS1(), extra: any = {}) => call(logPOST, '/x', as, post({ userId: 's1', sessionDay: day, durationMinutes: 30, rpe: 6, ...extra }));
    assert.strictEqual((await log('QUARTA')).status, 200); await settle(); assert.strictEqual(pushes().length, 0, '1º treino não avisa');
    assert.strictEqual((await log('SEXTA')).status, 200); await settle(); assert.strictEqual(pushes().length, 0, '2º treino não avisa');
    assert.strictEqual((await log('AVULSO')).status, 200); await settle(); assert.strictEqual(pushes().length, 0, 'corrida avulsa não avisa');
    assert.strictEqual((await log('DOMINGO')).status, 200); await settle();
    assert.strictEqual(pushes().length, 1, JSON.stringify(pushes())); assert.deepStrictEqual([pushes()[0].to, pushes()[0].title, pushes()[0].data], ['cA', 'Marcela fechou a semana 2 de 8', { type: 'running_progress', studentId: 's1', kind: 'week_done' }]);
    assert.ok(/3 de 3 treinos/.test(pushes()[0].body) && /esforço médio 6/.test(pushes()[0].body), pushes()[0].body);
    await log('QUARTA'); await settle(); assert.strictEqual(pushes().length, 1, 'treino a mais depois da semana fechada não avisa de novo');
    // concluiu o protocolo (prova no DOMINGO da última semana)
    clearPushes(); S.runningProtocol.length = 0; S.runningLog.length = 0; mkProto({ id: 'p2', currentWeek: 8, weekOpenedAt: ago(3) });
    await log('QUARTA'); await log('SEXTA'); await settle(); assert.strictEqual(pushes().length, 0);
    await log('DOMINGO', asS1(), { distanceKm: 5 }); await settle(); assert.deepStrictEqual(pushes().map((x: any) => [x.to, x.title, x.data.kind]), [['cA', 'Marcela concluiu o protocolo de 5K! 🏁', 'completed']]);
    // o coach registrando pelo aluno não recebe aviso do que ele mesmo fez
    clearPushes(); S.runningProtocol.length = 0; S.runningLog.length = 0; mkProto({ id: 'p3', currentWeek: 8, weekOpenedAt: ago(3) });
    await log('DOMINGO', tok('cA')); await settle(); assert.strictEqual(pushes().length, 0, 'ator = coach dono'); 
    // master registrando pelo aluno do cA: o coach dono é avisado
    clearPushes(); S.runningProtocol.length = 0; S.runningLog.length = 0; mkProto({ id: 'p4', currentWeek: 8, weekOpenedAt: ago(3) });
    await log('DOMINGO', tok(PAULO_ID, 'ADMIN')); await settle(); assert.deepStrictEqual(pushes().map((x: any) => x.to), ['cA']);
  });
  await block('push: semana passou do prazo — o treino que fecha com 2 avança, e o esforço alto repete', async () => {
    S.user.find((u: any) => u.id === 's1').name = 'Marcela Silva';
    const log = (day: string, extra: any = {}) => call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: day, durationMinutes: 30, ...extra }));
    mkProto({ id: 'p1', currentWeek: 3, weekOpenedAt: ago(9) }); mkLog({ protocolId: 'p1', sessionDay: 'QUARTA', createdAt: ago(8), rpe: 6 });
    await log('SEXTA', { rpe: 6 }); await settle();
    assert.deepStrictEqual(pushes().map((x: any) => [x.title, x.data.kind]), [['Marcela avançou para a semana 4 de 8', 'advanced']], JSON.stringify(pushes()));
    assert.ok(/fechada com 2 de 3 treinos/.test(pushes()[0].body), pushes()[0].body);
    clearPushes(); S.runningProtocol.length = 0; S.runningLog.length = 0;
    mkProto({ id: 'p2', currentWeek: 3, weekOpenedAt: ago(9) }); mkLog({ protocolId: 'p2', sessionDay: 'QUARTA', createdAt: ago(8), rpe: 9 });
    await log('SEXTA', { rpe: 10 }); await settle();
    assert.deepStrictEqual(pushes().map((x: any) => [x.title, x.data.kind]), [['Marcela vai repetir a semana 3', 'repeat']], JSON.stringify(pushes())); assert.ok(/esforço médio/.test(pushes()[0].body));
  });
  await block('push: protocolo ativado avisa a aluna (e o "novo desafio" quando já tinha um)', async () => {
    S.user.find((u: any) => u.id === 's1').name = 'Marcela Silva';
    const act = (o: any = {}, as = tok('cA')) => call(protoPOST, '/x', as, post({ userId: 's1', protocolType: '5K', startWeek: 1, trainingDays: ['TER', 'SEX', 'DOM'], ...o }));
    assert.strictEqual((await act()).status, 200); await settle();
    assert.deepStrictEqual(pushes().map((x: any) => [x.to, x.title, x.data]), [['s1', 'Seu protocolo de corrida está pronto 🏃', { type: 'running_protocol' }]]);
    assert.strictEqual(pushes()[0].body, 'Marcela, seu plano de 5K começa na semana 1 · treinos: ter, sex e dom. Toque para ver.');
    clearPushes(); assert.strictEqual((await act({ protocolType: '10K', startWeek: 3, trainingDays: [] })).status, 200); await settle();
    assert.deepStrictEqual(pushes().map((x: any) => [x.to, x.title, x.body]), [['s1', 'Seu novo protocolo de corrida está pronto 🏃', 'Marcela, seu plano de 10K começa na semana 3. Toque para ver.']]);
    // recusado (sem permissão / dado inválido) não avisa; ajustar (PATCH) também não; push fora do ar não quebra
    clearPushes(); assert.strictEqual((await act({}, asS1())).status, 403); assert.strictEqual((await act({}, tok('cB'))).status, 403); assert.strictEqual((await act({ startWeek: 99 })).status, 400); assert.strictEqual((await act({ protocolType: 'ZZ' })).status, 400);
    assert.strictEqual((await call(protoPATCH, '/x', tok('cA'), patch({ userId: 's1', customNotes: 'novo' }))).status, 200); await settle(); assert.strictEqual(pushes().length, 0);
    (globalThis as any).__pushFail = true; const down = await act(); await settle(); assert.strictEqual(down.status, 200); assert.strictEqual(S.runningProtocol.filter((x: any) => x.isActive).length, 1);
  });
  await block('andamento: fronteiras exatas (14 dias, 7 dias, abertura) e filtros', () => {
    assert.strictEqual(PR.resolveProgress(proto({ currentWeek: 3 }), [], at(14)).view.week, 2, 'exatamente 14 dias volta');
    assert.strictEqual(PR.resolveProgress(proto({ currentWeek: 3 }), [], at(14 - 1 / 24)).view.week, 3, '13 dias e 23 h ainda não');
    assert.strictEqual(PR.resolveProgress(proto({ currentWeek: 8 }), [], at(14)).view.week, 7); assert.strictEqual(PR.resolveProgress(proto({ currentWeek: 8 }), [], at(14 - 1 / 24)).view.week, 8);
    const stay = PR.resolveProgress(proto({ currentWeek: 8 }), [lg('QUARTA', 1), lg('SEXTA', 2)], at(20)); assert.deepStrictEqual([stay.view.week, stay.changed], [8, false], 'última semana com 2 treinos feitos não volta');
    const seven = PR.resolveProgress(proto(), [lg('QUARTA', 1)], at(7)); assert.deepStrictEqual([seven.view.overdue, seven.view.daysLeft], [true, 0]); assert.strictEqual(PR.resolveProgress(proto(), [lg('QUARTA', 1)], at(6.99)).view.overdue, false);
    assert.strictEqual(PR.resolveProgress(proto(), [], at(2.5)).view.daysLeft, 5, 'dias que faltam arredondam para cima');
    assert.deepStrictEqual(PR.resolveProgress(proto(), [lg('QUARTA', 0)], at(1)).view.doneKeys, ['QUARTA'], 'treino no instante da abertura conta');
    const av = PR.resolveProgress(proto(), [lg('QUARTA', 1), lg('AVULSO', 2), lg('AVULSO', 3)], at(8)); assert.deepStrictEqual([av.view.week, av.changed], [1, false], 'corrida avulsa não ajuda a fechar a semana');
    const zero = PR.resolveProgress(proto(), [lg('QUARTA', 1, 9), lg('SEXTA', 2, 0), lg('DOMINGO', 3, 9)], at(8)); assert.strictEqual(zero.next.lastRepeatWeek, 1, 'RPE 0 não conta: média 9 repete');
    const nine = PR.resolveProgress(proto(), [lg('QUARTA', 1, 9), lg('SEXTA', 2, 9), lg('DOMINGO', 3, 9)], at(8)); assert.strictEqual(nine.next.lastRepeatWeek, 1, 'média exatamente 9 repete');
    assert.strictEqual(PR.resolveProgress(proto(), [lg('QUARTA', 1, 7), lg('SEXTA', 2, 7), lg('DOMINGO', 3, 8)], at(3)).view.avgRpe, 7.3, 'média arredondada');
    const sb = PR.resolveProgress(proto({ currentWeek: 3, lastRepeatWeek: 3 }), [], at(15)); assert.deepStrictEqual([sb.view.week, sb.next.lastRepeatWeek], [2, null], 'voltar uma semana limpa a marca de repetição');
    const half = PR.resolveProgress(proto({ currentWeek: 3, weekOpenedAt: null, startDate: at(0) }), [], at(20)); assert.deepStrictEqual([half.view.week, half.changed], [3, true], 'sem relógio da semana = protocolo antigo');
    assert.strictEqual(PR.resolveProgress(proto({ currentWeek: 99 }), [], at(1)).view.week, 8, 'semana fora do protocolo é limitada');
    const mid = new Date(at(0)); mid.setHours(0, 0, 0, 0);
    const l3 = PR.resolveProgress({ id: 'p1', protocolType: '5K', startWeek: 3, startDate: at(0), currentWeek: null, weekOpenedAt: null } as any, [], at(15)); assert.deepStrictEqual([l3.view.week, l3.next.weekOpenedAt.getTime()], [5, mid.getTime() + 14 * DAY], 'a semana do calendário abre alinhada ao início do protocolo');
    const fut = PR.resolveProgress({ id: 'p1', protocolType: '5K', startWeek: 1, startDate: at(5), currentWeek: null, weekOpenedAt: null } as any, [], at(0)); assert.ok(fut.next.weekOpenedAt.getTime() <= at(0).getTime() && fut.view.daysLeft <= 7, 'protocolo que começa no futuro não abre a semana no futuro');
    const cr = PR.applyCoachAction(proto({ currentWeek: 3, completedAt: at(1) }), { action: 'repeat' }, at(2))!; assert.deepStrictEqual([cr.completedAt, cr.weekOpenedAt.getTime(), cr.lastRepeatWeek], [null, at(2).getTime(), 3], 'repetir reabre e zera o relógio');
    assert.strictEqual(PR.applyCoachAction(proto({ currentWeek: 7 }), { action: 'advance' }, at(2))!.completedAt, null, 'liberar a 7 não conclui o 5K');
    assert.deepStrictEqual(PR.applyCoachAction(proto({ currentWeek: 3 }), { action: 'set-week', week: 8 }, at(2))!.currentWeek, 8); assert.strictEqual(PR.applyCoachAction(proto({ currentWeek: 3 }), { action: 'set-week', week: 9 }, at(2)), null);
  });
  await block('planos/regras: dias, elegibilidade, sugestão e IA (casos que fixam o comportamento)', () => {
    assert.strictEqual(PL.clampWeek('5K', 0), 1); assert.strictEqual(PL.clampWeek('5K', 8), 8); assert.strictEqual(PL.clampWeek('5K', 9), 8);
    const d = (a: string[]) => PL.suggestTrainingDays(a).days;
    assert.deepStrictEqual(d(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']), ['TER', 'QUI', 'DOM']); assert.deepStrictEqual(d(['SEG', 'TER', 'QUA', 'QUI']), ['TER', 'QUI', 'SEG']);
    assert.deepStrictEqual(d(['TER', 'QUI', 'SÁB']), ['QUI', 'TER', 'SAB']); assert.deepStrictEqual(d(['SEG', 'QUA', 'SEX', 'DOM']), ['SEX', 'QUA', 'DOM']); assert.deepStrictEqual(d(['SÁB', 'DOM', 'SEG']), ['SEG', 'SAB', 'DOM']);
    assert.deepStrictEqual(d(['TER', 'QUI', 'SAB', 'DOM']), ['TER', 'QUI', 'DOM'], 'domingo vence sábado para o longão'); assert.deepStrictEqual(d(['SEG', 'TER', 'QUA', 'SAB']), ['SEG', 'QUA', 'SAB']); assert.deepStrictEqual(d(['QUA', 'QUI', 'SEX']), ['QUI', 'SEX', 'QUA']);
    const strong = { runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', weeklyFrequencyNow: '3', fitnessLevel: 4, canJog5min: true, medicalClearance: 'yes' };
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', completedRaces: false, racesDescription: 'corri uma de 10k' }), ['5K'], 'texto de prova sem prova completada não vale');
    assert.deepStrictEqual(PL.eligibleTypes({ runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', completedRaces: true, racesDescription: 'corri uma de 10k' }), ['5K', '10K'], 'com prova completada, vale');
    assert.deepStrictEqual(PL.eligibleTypes({ ...strong, weeklyFrequencyNow: '2', completedRaces: true, racesDescription: 'meia maratona' }), ['5K', '10K'], '21K exige 3 treinos por semana');
    assert.deepStrictEqual(PL.eligibleTypes({ ...strong, completedRaces: true, racesDescription: 'meia maratona' }), ['5K', '10K', '21K'], 'meia maratona não é maratona');
    assert.deepStrictEqual(PL.eligibleTypes({ ...strong, completedRaces: false, racesDescription: 'meia maratona' }), ['5K', '10K'], '21K exige prova completada');
    assert.deepStrictEqual(PL.eligibleTypes({ ...strong, completedRaces: true, racesDescription: '42k em 2025' }), ['5K', '10K', '21K', '42K']);
    assert.strictEqual(PL.sanitizeSpeeds({ z2: 7, z3: 8, z4: 10, z5: 9 }), null, 'z4 maior que z5');
    // semana de entrada e predefinições
    const wk = (a: any) => PL.suggestByRules({ canJog5min: true, fitnessLevel: 3, ...a });
    assert.strictEqual(wk({ runningExperience: 'active', weeklyFrequencyNow: '3', maxDistanceBefore: 'Menos de 1km' }).startWeek, 1); assert.strictEqual(wk({ runningExperience: 'active', weeklyFrequencyNow: '3', maxDistanceBefore: '2 a 3km' }).startWeek, 3);
    assert.strictEqual(wk({ runningExperience: 'active', weeklyFrequencyNow: '1', maxDistanceBefore: '3 a 5km' }).startWeek, 1, 'treina pouco: não entra adiantada'); assert.strictEqual(wk({ runningExperience: 'active', weeklyFrequencyNow: '3', maxDistanceBefore: '3 a 5km', canJog5min: false }).startWeek, 1, 'não trota 5 min: começa do zero');
    assert.strictEqual(wk({ runningExperience: 'stopped', timeStopped: 'Menos de 3 meses', maxDistanceBefore: '3 a 5km' }).startWeek, 3); assert.strictEqual(wk({ runningExperience: 'stopped', timeStopped: '6 meses a 1 ano', maxDistanceBefore: '3 a 5km' }).startWeek, 1);
    assert.deepStrictEqual(wk({ runningExperience: 'stopped', fitnessLevel: 3 }).customSpeeds, PL.SPEED_PRESETS.iniciante, 'quem parou usa velocidades de iniciante');
    assert.deepStrictEqual(wk({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', fitnessLevel: 3 }).customSpeeds, PL.SPEED_PRESETS.padrao, 'corre bem mas se avalia 3: padrão');
    assert.deepStrictEqual(wk({ runningExperience: 'active', maxDistanceBefore: 'Mais de 5km', fitnessLevel: 4 }).customSpeeds, PL.SPEED_PRESETS.experiente);
    assert.ok(PL.suggestByRules({ runningExperience: 'never', medicalClearance: 'no', canJog5min: true }).warnings.some((w) => /Sem liberação médica/.test(w)));
    assert.ok(!PL.suggestByRules({ runningExperience: 'never', medicalClearance: 'yes', canJog5min: true }).warnings.some((w) => /liberação/.test(w)));
    // IA mais cautelosa ou diferente das regras
    const strongGoal10 = { ...strong, completedRaces: true, racesDescription: '10k', runningGoal: 'complete_10k' };
    const lower = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: 6 }, strongGoal10); assert.strictEqual(lower.suggestion.protocolType, '5K'); assert.strictEqual(lower.suggestion.startWeek, 3, 'IA escolheu 5K em vez de 10K: entra no máximo na semana 3');
    const a21 = { ...strong, completedRaces: true, racesDescription: 'meia maratona', runningGoal: 'complete_21k' };
    assert.strictEqual(PL.suggestByRules(a21).protocolType, '21K'); const other = PL.sanitizeAiSuggestion({ protocolType: '10K', startWeek: 3 }, a21); assert.deepStrictEqual([other.suggestion.protocolType, other.suggestion.startWeek], ['10K', 1], 'IA escolheu 10K em vez de 21K: entra na semana 1');
    const mid = { runningExperience: 'active', maxDistanceBefore: '3 a 5km', weeklyFrequencyNow: '3', fitnessLevel: 3, canJog5min: true, injuries: ['Joelho'], runningGoal: 'complete_5k' };
    const nullWeek = PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: null, adaptations: null }, mid); assert.strictEqual(nullWeek.suggestion.startWeek, 5, 'semana nula = a das regras'); assert.ok(/Joelho/.test(nullWeek.suggestion.adaptations!), 'adaptações ausentes = as das regras');
    assert.strictEqual(PL.sanitizeAiSuggestion({ protocolType: '5K', startWeek: '' }, mid).suggestion.startWeek, 5);
  });
  await block('LOG/GET: faixas, arredondamento, ordem e filtro de registros', async () => {
    mkProto({ id: 'p1', currentWeek: 1, weekOpenedAt: ago(1) });
    const one = (o: any) => call(logPOST, '/x', asS1(), post({ userId: 's1', sessionDay: 'QUARTA', durationMinutes: 30, distanceKm: 3, ...o }));
    assert.strictEqual((await one({ durationMinutes: 0 })).status, 400, 'duração zero'); assert.strictEqual((await one({ distanceKm: 0 })).status, 400, 'distância zero'); assert.strictEqual((await one({ durationMinutes: 1 })).status, 200); assert.strictEqual((await one({ distanceKm: 0.1 })).status, 200);
    await one({ avgPace: 'x'.repeat(50), distanceKm: 3.456 }); const last = S.runningLog[S.runningLog.length - 1]; assert.deepStrictEqual([last.avgPace.length, last.distanceKm], [20, 3.46]);
    // GET: mais novo primeiro; protocolo antigo fica fora de protocol.logs mas dentro de logs
    S.runningLog.length = 0; mkProto({ id: 'velho', isActive: false, createdAt: ago(60) });
    mkLog({ protocolId: 'velho', sessionDay: 'SEXTA', createdAt: ago(40) }); mkLog({ protocolId: 'p1', sessionDay: 'QUARTA', createdAt: ago(0.5) }); mkLog({ protocolId: 'p1', sessionDay: 'AVULSO', createdAt: ago(0.2) });
    const g = await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } });
    assert.deepStrictEqual(g.json.logs.map((l: any) => l.sessionDay), ['AVULSO', 'QUARTA', 'SEXTA'], 'logs: do mais novo para o mais antigo, de todos os protocolos'); assert.deepStrictEqual(g.json.protocol.logs.map((l: any) => l.sessionDay), ['AVULSO', 'QUARTA'], 'protocol.logs: só os do protocolo ativo');
    S.calls = {}; await call(userGET, '/x', asS1(), {}, { params: { userId: 's1' } }); assert.strictEqual(S.calls['runningProtocol.update'] || 0, 0, 'andamento em dia: não grava nada');
  });

  console.log(`\n${fails ? 'FALHOU' : 'OK'}: ${passed} blocos ok, ${fails} falharam`);
  process.exit(fails ? 1 : 0);
})();

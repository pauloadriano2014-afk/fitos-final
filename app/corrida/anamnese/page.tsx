'use client';

import { useState, useEffect } from 'react';

const API = 'https://fitos-final.onrender.com';
const ACCENT = '#22c55e';
const BG = '#0d0d0d';
const SURFACE = '#1a1a1a';
const BORDER = '#2a2a2a';
const TEXT = '#f5f5f5';
const TEXT_SEC = '#888';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type FormData = {
  // Etapa 1
  runningExperience: string;
  timeStopped: string;
  maxDistanceBefore: string;
  weeklyFrequencyNow: string;
  completedRaces: boolean;
  racesDescription: string;
  // Etapa 2
  canWalk30min: boolean | null;
  canJog5min: boolean | null;
  breathingDifficulty: string;
  fitnessLevel: number | null;
  // Etapa 3
  injuries: string[];
  heartCondition: boolean | null;
  jointIssues: boolean | null;
  medications: string;
  medicalClearance: string;
  // Etapa 4
  runningGoal: string;
  goalDeadline: string;
  previousFailures: string;
  // Etapa 5
  availableDays: string[];
  preferredTime: string;
  trainingLocation: string;
  hasProperShoes: string;
  // Etapa 6
  weight: string;
  height: string;
  bodyPainDuringWalk: string;
  sleepQuality: string;
};

const INITIAL: FormData = {
  runningExperience: '', timeStopped: '', maxDistanceBefore: '',
  weeklyFrequencyNow: '', completedRaces: false, racesDescription: '',
  canWalk30min: null, canJog5min: null, breathingDifficulty: '', fitnessLevel: null,
  injuries: [], heartCondition: null, jointIssues: null, medications: '', medicalClearance: '',
  runningGoal: '', goalDeadline: '', previousFailures: '',
  availableDays: [], preferredTime: '', trainingLocation: '', hasProperShoes: '',
  weight: '', height: '', bodyPainDuringWalk: '', sleepQuality: '',
};

const TOTAL_STEPS = 6;

// ─── Helpers de estilo inline ─────────────────────────────────────────────────
const s = {
  wrap: { minHeight: '100vh', backgroundColor: BG, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '0' } as React.CSSProperties,
  inner: { width: '100%', maxWidth: 480, margin: '0 auto', padding: '30px 24px 80px', borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, minHeight: '100vh', backgroundColor: BG } as React.CSSProperties,
  logo: { fontSize: 11, fontWeight: 900, letterSpacing: 3, color: ACCENT, marginBottom: 4 } as React.CSSProperties,
  title: { fontSize: 28, fontWeight: 900, color: TEXT, letterSpacing: -1, lineHeight: 1.1 } as React.CSSProperties,
  accent: { color: ACCENT } as React.CSSProperties,
  subtitle: { fontSize: 13, color: TEXT_SEC, marginTop: 6, lineHeight: 1.5 } as React.CSSProperties,
  progressBar: { height: 4, backgroundColor: BORDER, borderRadius: 2, margin: '24px 0 28px', overflow: 'hidden' } as React.CSSProperties,
  progressFill: (pct: number) => ({ height: '100%', width: `${pct}%`, backgroundColor: ACCENT, borderRadius: 2, transition: 'width 0.4s ease' } as React.CSSProperties),
  stepLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 2, color: TEXT_SEC, marginBottom: 20 } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 900, color: TEXT, letterSpacing: 1, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
  label: { fontSize: 10, fontWeight: 800, color: TEXT_SEC, letterSpacing: 1, marginBottom: 10, marginTop: 20, display: 'block' } as React.CSSProperties,
  input: { width: '100%', padding: '14px 16px', borderRadius: 16, border: `1px solid ${BORDER}`, backgroundColor: SURFACE, color: TEXT, fontSize: 15, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' } as React.CSSProperties,
  textarea: { width: '100%', padding: '14px 16px', borderRadius: 16, border: `1px solid ${BORDER}`, backgroundColor: SURFACE, color: TEXT, fontSize: 14, outline: 'none', resize: 'none', minHeight: 80, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 } as React.CSSProperties,
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 10 } as React.CSSProperties,
  chip: (active: boolean) => ({ padding: '10px 16px', borderRadius: 20, border: `1px solid ${active ? ACCENT : BORDER}`, backgroundColor: active ? ACCENT : SURFACE, color: active ? '#000' : TEXT_SEC, fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' } as React.CSSProperties),
  chipFull: (active: boolean) => ({ padding: '14px 16px', borderRadius: 16, border: `1px solid ${active ? ACCENT : BORDER}`, backgroundColor: active ? ACCENT + '22' : SURFACE, color: active ? ACCENT : TEXT_SEC, fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit' } as React.CSSProperties),
  row: { display: 'flex', gap: 12 } as React.CSSProperties,
  half: { flex: 1 } as React.CSSProperties,
  circle: (active: boolean) => ({ width: 44, height: 44, borderRadius: 22, border: `1px solid ${active ? ACCENT : BORDER}`, backgroundColor: active ? ACCENT : SURFACE, color: active ? '#000' : TEXT, fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', fontFamily: 'inherit' } as React.CSSProperties),
  boolRow: { display: 'flex', gap: 12 } as React.CSSProperties,
  boolBtn: (active: boolean, color?: string) => ({ flex: 1, padding: '14px', borderRadius: 16, border: `1px solid ${active ? (color || ACCENT) : BORDER}`, backgroundColor: active ? (color || ACCENT) : SURFACE, color: active ? '#000' : TEXT_SEC, fontWeight: 800, fontSize: 13, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', fontFamily: 'inherit' } as React.CSSProperties),
  navRow: { display: 'flex', gap: 12, marginTop: 36 } as React.CSSProperties,
  btnBack: { flex: 1, padding: '16px', borderRadius: 16, border: `1px solid ${BORDER}`, backgroundColor: 'transparent', color: TEXT_SEC, fontWeight: 900, fontSize: 14, cursor: 'pointer', letterSpacing: 1, fontFamily: 'inherit' } as React.CSSProperties,
  btnNext: (disabled: boolean) => ({ flex: 2, padding: '16px', borderRadius: 16, border: 'none', backgroundColor: disabled ? BORDER : ACCENT, color: disabled ? TEXT_SEC : '#000', fontWeight: 900, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: 1, transition: 'all 0.2s', fontFamily: 'inherit' } as React.CSSProperties),
  card: { backgroundColor: SURFACE, borderRadius: 20, border: `1px solid ${BORDER}`, padding: '20px', marginBottom: 16 } as React.CSSProperties,
  successWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '30px 24px', backgroundColor: BG, textAlign: 'center' } as React.CSSProperties,
  errorWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '30px 24px', backgroundColor: BG, textAlign: 'center' } as React.CSSProperties,
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function RunningAnamnesePage() {
  const [token, setToken] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // Pega o token da URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) { setInvalid(true); setLoading(false); return; }
    setToken(t);

    fetch(`${API}/api/running/anamnese/${t}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setInvalid(true); return; }
        setUserName(data.user?.name?.split(' ')[0] || '');
        // Se já preencheu, pré-popula o form
        if (data.filled) {
          setForm(f => ({
            ...f,
            runningExperience: data.runningExperience || '',
            timeStopped: data.timeStopped || '',
            maxDistanceBefore: data.maxDistanceBefore || '',
            weeklyFrequencyNow: data.weeklyFrequencyNow || '',
            completedRaces: data.completedRaces || false,
            racesDescription: data.racesDescription || '',
            canWalk30min: data.canWalk30min,
            canJog5min: data.canJog5min,
            breathingDifficulty: data.breathingDifficulty || '',
            fitnessLevel: data.fitnessLevel,
            injuries: data.injuries || [],
            heartCondition: data.heartCondition,
            jointIssues: data.jointIssues,
            medications: data.medications || '',
            medicalClearance: data.medicalClearance || '',
            runningGoal: data.runningGoal || '',
            goalDeadline: data.goalDeadline || '',
            previousFailures: data.previousFailures || '',
            availableDays: data.availableDays || [],
            preferredTime: data.preferredTime || '',
            trainingLocation: data.trainingLocation || '',
            hasProperShoes: data.hasProperShoes || '',
            weight: data.weight ? String(data.weight) : '',
            height: data.height ? String(data.height) : '',
            bodyPainDuringWalk: data.bodyPainDuringWalk || '',
            sleepQuality: data.sleepQuality || '',
          }));
        }
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, []);

  const set = (field: keyof FormData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  const toggleArr = (field: keyof FormData, val: string) => {
    const arr = (form[field] as string[]);
    if (val === 'Nenhuma') { set(field, ['Nenhuma']); return; }
    const next = arr.includes(val)
      ? arr.filter(x => x !== val)
      : [...arr.filter(x => x !== 'Nenhuma'), val];
    set(field, next);
  };

  // Validação por etapa
  const canAdvance = () => {
    if (step === 1) return !!form.runningExperience;
    if (step === 2) return form.canWalk30min !== null && form.canJog5min !== null && !!form.breathingDifficulty && form.fitnessLevel !== null;
    if (step === 3) return form.injuries.length > 0 && form.heartCondition !== null && form.jointIssues !== null && !!form.medicalClearance;
    if (step === 4) return !!form.runningGoal;
    if (step === 5) return form.availableDays.length > 0 && !!form.preferredTime && !!form.trainingLocation && !!form.hasProperShoes;
    if (step === 6) return !!form.sleepQuality;
    return false;
  };

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        weight: form.weight ? parseFloat(form.weight.replace(',', '.')) : null,
        height: form.height ? parseFloat(form.height.replace(',', '.')) : null,
      };
      const res = await fetch(`${API}/api/running/anamnese/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) setDone(true);
      else alert('Erro ao enviar. Tente novamente.');
    } catch {
      alert('Erro de conexão. Verifique sua internet.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Tela de loading ──
  if (loading) return (
    <div style={{ ...s.errorWrap }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTop: `3px solid ${ACCENT}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: TEXT_SEC, marginTop: 20, fontSize: 13 }}>Carregando...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  // ── Link inválido ──
  if (invalid) return (
    <div style={s.errorWrap}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ color: TEXT, fontWeight: 900, fontSize: 22, marginBottom: 8 }}>LINK INVÁLIDO</h2>
      <p style={{ color: TEXT_SEC, fontSize: 14, lineHeight: 1.6 }}>Este link é inválido ou já expirou. Solicite um novo link ao seu Coach.</p>
    </div>
  );

  // ── Sucesso ──
  if (done) return (
    <div style={s.successWrap}>
      <div style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: ACCENT + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 24 }}>🏃</div>
      <p style={{ ...s.logo, marginBottom: 8 }}>PAULO ADRIANO TEAM</p>
      <h2 style={{ ...s.title, fontSize: 26, marginBottom: 12 }}>ANAMNESE<br /><span style={s.accent}>CONCLUÍDA!</span></h2>
      <p style={{ color: TEXT_SEC, fontSize: 14, lineHeight: 1.7, maxWidth: 320, margin: '0 auto' }}>
        Recebi suas informações{userName ? `, ${userName}` : ''}! 🙌<br /><br />
        Vou analisar tudo e montar o seu protocolo personalizado. Em breve você receberá acesso ao plano de corrida no app.
      </p>
      <p style={{ color: ACCENT, fontWeight: 900, fontSize: 12, letterSpacing: 2, marginTop: 32 }}>PAULO ADRIANO TEAM</p>
    </div>
  );

  const pct = ((step - 1) / TOTAL_STEPS) * 100;

  return (
    <div style={s.wrap}>
      <div style={s.inner}>

        {/* Header */}
        <p style={s.logo}>PAULO ADRIANO TEAM</p>
        <h1 style={s.title}>ANAMNESE DE <span style={s.accent}>CORRIDA</span></h1>
        <p style={s.subtitle}>
          {userName ? `Olá, ${userName}! ` : ''}Responda com sinceridade — cada detalhe monta o protocolo certo pra você.
        </p>

        {/* Barra de progresso */}
        <div style={s.progressBar}>
          <div style={s.progressFill(pct)} />
        </div>
        <p style={s.stepLabel}>ETAPA {step} DE {TOTAL_STEPS}</p>

        {/* ══════════════════════════════════════════════
            ETAPA 1 — Experiência com corrida
        ══════════════════════════════════════════════ */}
        {step === 1 && (
          <div>
            <p style={s.sectionTitle}>👟 Experiência com corrida</p>

            <span style={s.label}>VOCÊ JÁ CORREU ANTES? *</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { val: 'never', label: 'Nunca corri', desc: 'Sou completamente iniciante' },
                { val: 'stopped', label: 'Já corri mas parei', desc: 'Tive uma experiência anterior' },
                { val: 'active', label: 'Corro atualmente', desc: 'Já tenho alguma frequência' },
              ].map(opt => (
                <button key={opt.val} style={s.chipFull(form.runningExperience === opt.val)} onClick={() => set('runningExperience', opt.val)}>
                  <span style={{ fontWeight: 900, fontSize: 14 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontWeight: 500, fontSize: 12, opacity: 0.7, marginTop: 2 }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            {form.runningExperience === 'stopped' && (
              <>
                <span style={s.label}>HÁ QUANTO TEMPO PAROU?</span>
                <div style={s.chipRow}>
                  {['Menos de 3 meses', '3 a 6 meses', '6 meses a 1 ano', 'Mais de 1 ano'].map(v => (
                    <button key={v} style={s.chip(form.timeStopped === v)} onClick={() => set('timeStopped', v)}>{v}</button>
                  ))}
                </div>

                <span style={s.label}>QUAL ERA A DISTÂNCIA MÁXIMA QUE COMPLETAVA?</span>
                <div style={s.chipRow}>
                  {['Menos de 1km', '1 a 2km', '2 a 3km', '3 a 5km', 'Mais de 5km'].map(v => (
                    <button key={v} style={s.chip(form.maxDistanceBefore === v)} onClick={() => set('maxDistanceBefore', v)}>{v}</button>
                  ))}
                </div>
              </>
            )}

            {form.runningExperience === 'active' && (
              <>
                <span style={s.label}>QUAL É A SUA FREQUÊNCIA ATUAL?</span>
                <div style={s.chipRow}>
                  {['1x por semana', '2x por semana', '3x por semana', '4x ou mais'].map(v => (
                    <button key={v} style={s.chip(form.weeklyFrequencyNow === v)} onClick={() => set('weeklyFrequencyNow', v)}>{v}</button>
                  ))}
                </div>
              </>
            )}

            {(form.runningExperience === 'stopped' || form.runningExperience === 'active') && (
              <>
                <span style={s.label}>JÁ COMPLETOU ALGUMA PROVA?</span>
                <div style={s.boolRow}>
                  <button style={s.boolBtn(form.completedRaces === true)} onClick={() => set('completedRaces', true)}>SIM</button>
                  <button style={s.boolBtn(form.completedRaces === false)} onClick={() => set('completedRaces', false)}>NÃO</button>
                </div>
                {form.completedRaces && (
                  <>
                    <span style={s.label}>QUAL(IS) PROVA(S)?</span>
                    <input style={s.input} placeholder="Ex: 5k em 2023, 10k em 2024" value={form.racesDescription} onChange={e => set('racesDescription', e.target.value)} />
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ETAPA 2 — Condicionamento atual
        ══════════════════════════════════════════════ */}
        {step === 2 && (
          <div>
            <p style={s.sectionTitle}>💪 Condicionamento atual</p>

            <span style={s.label}>CONSEGUE CAMINHAR 30 MIN SEM DESCONFORTO? *</span>
            <div style={s.boolRow}>
              <button style={s.boolBtn(form.canWalk30min === true)} onClick={() => set('canWalk30min', true)}>SIM</button>
              <button style={s.boolBtn(form.canWalk30min === false)} onClick={() => set('canWalk30min', false)}>NÃO</button>
            </div>

            <span style={s.label}>CONSEGUE TROTAR POR 5 MIN SEM PARAR? *</span>
            <div style={s.boolRow}>
              <button style={s.boolBtn(form.canJog5min === true)} onClick={() => set('canJog5min', true)}>SIM</button>
              <button style={s.boolBtn(form.canJog5min === false)} onClick={() => set('canJog5min', false)}>NÃO / NUNCA TENTEI</button>
            </div>

            <span style={s.label}>EM QUE MOMENTO SENTE FALTA DE AR? *</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { val: 'light', label: 'Em esforços leves', desc: 'Caminhada já cansa' },
                { val: 'moderate', label: 'Em esforços moderados', desc: 'Trote já complica' },
                { val: 'intense', label: 'Só em esforços intensos', desc: 'Consigo trotar bem' },
                { val: 'never', label: 'Quase nunca', desc: 'Boa capacidade respiratória' },
              ].map(opt => (
                <button key={opt.val} style={s.chipFull(form.breathingDifficulty === opt.val)} onClick={() => set('breathingDifficulty', opt.val)}>
                  <span style={{ fontWeight: 900, fontSize: 14 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontWeight: 500, fontSize: 12, opacity: 0.7, marginTop: 2 }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            <span style={s.label}>AUTOAVALIAÇÃO DO SEU CONDICIONAMENTO (1 = MUITO FRACO, 5 = BOM) *</span>
            <div style={{ display: 'flex', gap: 10 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} style={s.circle(form.fitnessLevel === n)} onClick={() => set('fitnessLevel', n)}>{n}</button>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ETAPA 3 — Saúde e lesões
        ══════════════════════════════════════════════ */}
        {step === 3 && (
          <div>
            <p style={s.sectionTitle}>🏥 Saúde e lesões</p>

            <span style={s.label}>LESÕES OU DORES (SELECIONE TODAS QUE SE APLICAM) *</span>
            <div style={s.chipRow}>
              {['Joelho', 'Tornozelo', 'Quadril', 'Lombar', 'Plantar/Pé', 'Canela', 'Nenhuma'].map(v => (
                <button key={v} style={s.chip(form.injuries.includes(v))} onClick={() => toggleArr('injuries', v)}>{v}</button>
              ))}
            </div>

            <span style={s.label}>TEM ALGUMA CONDIÇÃO CARDÍACA DIAGNOSTICADA? *</span>
            <div style={s.boolRow}>
              <button style={s.boolBtn(form.heartCondition === true, '#ef4444')} onClick={() => set('heartCondition', true)}>SIM</button>
              <button style={s.boolBtn(form.heartCondition === false)} onClick={() => set('heartCondition', false)}>NÃO</button>
            </div>

            <span style={s.label}>TEM PROBLEMA ARTICULAR OU ORTOPÉDICO ATIVO? *</span>
            <div style={s.boolRow}>
              <button style={s.boolBtn(form.jointIssues === true, '#ef4444')} onClick={() => set('jointIssues', true)}>SIM</button>
              <button style={s.boolBtn(form.jointIssues === false)} onClick={() => set('jointIssues', false)}>NÃO</button>
            </div>

            <span style={s.label}>FAZ USO DE MEDICAMENTO CONTÍNUO?</span>
            <input style={s.input} placeholder="Ex: Losartana, Metformina. Deixe em branco se não." value={form.medications} onChange={e => set('medications', e.target.value)} />

            <span style={s.label}>TEM LIBERAÇÃO MÉDICA PARA ATIVIDADE FÍSICA? *</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {[
                { val: 'yes', label: 'Sim, tenho liberação' },
                { val: 'no', label: 'Não tenho liberação' },
                { val: 'not_consulted', label: 'Não consultei médico recentemente' },
              ].map(opt => (
                <button key={opt.val} style={s.chipFull(form.medicalClearance === opt.val)} onClick={() => set('medicalClearance', opt.val)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ETAPA 4 — Objetivo e motivação
        ══════════════════════════════════════════════ */}
        {step === 4 && (
          <div>
            <p style={s.sectionTitle}>🎯 Objetivo e motivação</p>

            <span style={s.label}>QUAL É O SEU OBJETIVO PRINCIPAL? *</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { val: 'complete_5k', label: 'Completar os 5km', desc: 'Quero cruzar a linha de chegada' },
                { val: 'weight_loss', label: 'Emagrecer', desc: 'Usar a corrida para queimar gordura' },
                { val: 'fitness', label: 'Condicionamento geral', desc: 'Melhorar minha saúde e disposição' },
                { val: 'race', label: 'Me preparar para uma prova', desc: 'Tenho uma corrida oficial em mente' },
                { val: 'other', label: 'Outro objetivo', desc: 'Vou descrever abaixo' },
              ].map(opt => (
                <button key={opt.val} style={s.chipFull(form.runningGoal === opt.val)} onClick={() => set('runningGoal', opt.val)}>
                  <span style={{ fontWeight: 900, fontSize: 14 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontWeight: 500, fontSize: 12, opacity: 0.7, marginTop: 2 }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            <span style={s.label}>QUAL O SEU PRAZO PESSOAL?</span>
            <div style={s.chipRow}>
              {['1 mês', '2 meses', '3 meses', '6 meses', 'Sem prazo definido'].map(v => (
                <button key={v} style={s.chip(form.goalDeadline === v)} onClick={() => set('goalDeadline', v)}>{v}</button>
              ))}
            </div>

            <span style={s.label}>O QUE JÁ TENTOU ANTES E NÃO FUNCIONOU?</span>
            <textarea style={s.textarea} placeholder="Ex: Já tentei correr sozinha mas desisti por falta de orientação..." value={form.previousFailures} onChange={e => set('previousFailures', e.target.value)} />
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ETAPA 5 — Rotina e disponibilidade
        ══════════════════════════════════════════════ */}
        {step === 5 && (
          <div>
            <p style={s.sectionTitle}>📅 Rotina e disponibilidade</p>

            <span style={s.label}>QUAIS DIAS VOCÊ PODE TREINAR? (MÍNIMO 3) *</span>
            <div style={s.chipRow}>
              {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(v => (
                <button key={v} style={s.circle(form.availableDays.includes(v))} onClick={() => {
                  const arr = form.availableDays.includes(v)
                    ? form.availableDays.filter(x => x !== v)
                    : [...form.availableDays, v];
                  set('availableDays', arr);
                }}>{v}</button>
              ))}
            </div>
            {form.availableDays.length > 0 && form.availableDays.length < 3 && (
              <p style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, marginTop: 8 }}>⚠️ O protocolo exige pelo menos 3 dias por semana.</p>
            )}

            <span style={s.label}>HORÁRIO PREFERIDO PARA TREINAR *</span>
            <div style={s.chipRow}>
              {[
                { val: 'morning', label: '🌅 Manhã' },
                { val: 'afternoon', label: '☀️ Tarde' },
                { val: 'evening', label: '🌙 Noite' },
              ].map(opt => (
                <button key={opt.val} style={s.chip(form.preferredTime === opt.val)} onClick={() => set('preferredTime', opt.val)}>{opt.label}</button>
              ))}
            </div>

            <span style={s.label}>ONDE VAI TREINAR? *</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { val: 'treadmill', label: '🏋️ Esteira', desc: 'Academia ou esteira em casa' },
                { val: 'street', label: '🏙️ Rua / Pista', desc: 'Área aberta, parque ou calçada' },
                { val: 'both', label: '🔄 Ambos', desc: 'Alternarei conforme o dia' },
              ].map(opt => (
                <button key={opt.val} style={s.chipFull(form.trainingLocation === opt.val)} onClick={() => set('trainingLocation', opt.val)}>
                  <span style={{ fontWeight: 900, fontSize: 14 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontWeight: 500, fontSize: 12, opacity: 0.7, marginTop: 2 }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            <span style={s.label}>TEM TÊNIS ADEQUADO PARA CORRIDA? *</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { val: 'yes', label: '✅ Sim, tenho tênis de corrida' },
                { val: 'no', label: '❌ Não, uso tênis comum' },
                { val: 'not_sure', label: '🤔 Não sei se é adequado' },
              ].map(opt => (
                <button key={opt.val} style={s.chipFull(form.hasProperShoes === opt.val)} onClick={() => set('hasProperShoes', opt.val)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ETAPA 6 — Dados físicos complementares
        ══════════════════════════════════════════════ */}
        {step === 6 && (
          <div>
            <p style={s.sectionTitle}>📊 Informações físicas</p>

            <div style={s.row}>
              <div style={s.half}>
                <span style={{ ...s.label, marginTop: 0 }}>PESO (KG)</span>
                <input style={s.input} placeholder="Ex: 68.5" keyboardType="decimal-pad" value={form.weight} onChange={e => set('weight', e.target.value)} />
              </div>
              <div style={s.half}>
                <span style={{ ...s.label, marginTop: 0 }}>ALTURA (CM)</span>
                <input style={s.input} placeholder="Ex: 165" value={form.height} onChange={e => set('height', e.target.value)} />
              </div>
            </div>

            <span style={s.label}>SENTE DORES DURANTE OU APÓS CAMINHAR/CORRER?</span>
            <textarea style={s.textarea} placeholder="Descreva onde e quando aparece a dor. Deixe em branco se não." value={form.bodyPainDuringWalk} onChange={e => set('bodyPainDuringWalk', e.target.value)} />

            <span style={s.label}>COMO ESTÁ A SUA QUALIDADE DE SONO? *</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { val: 'good', label: '😴 Boa', desc: 'Durmo bem, acordo descansado(a)' },
                { val: 'regular', label: '😐 Regular', desc: 'Às vezes durmo mal' },
                { val: 'bad', label: '😩 Ruim', desc: 'Tenho dificuldade para dormir ou acordo cansado(a)' },
              ].map(opt => (
                <button key={opt.val} style={s.chipFull(form.sleepQuality === opt.val)} onClick={() => set('sleepQuality', opt.val)}>
                  <span style={{ fontWeight: 900, fontSize: 14 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontWeight: 500, fontSize: 12, opacity: 0.7, marginTop: 2 }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            {/* Card de confirmação */}
            <div style={{ ...s.card, marginTop: 28, borderColor: ACCENT + '44', backgroundColor: ACCENT + '0d' }}>
              <p style={{ color: ACCENT, fontWeight: 900, fontSize: 12, letterSpacing: 1, marginBottom: 8 }}>✅ TUDO CERTO!</p>
              <p style={{ color: TEXT_SEC, fontSize: 13, lineHeight: 1.6 }}>
                Ao enviar, o Coach Paulo receberá suas informações e montará o protocolo personalizado para você.
              </p>
            </div>
          </div>
        )}

        {/* ── Navegação ── */}
        <div style={s.navRow}>
          {step > 1 && (
            <button style={s.btnBack} onClick={() => setStep(s => s - 1)}>← VOLTAR</button>
          )}
          {step < TOTAL_STEPS ? (
            <button
              style={s.btnNext(!canAdvance())}
              onClick={() => { if (canAdvance()) setStep(s => s + 1); }}
              disabled={!canAdvance()}
            >
              PRÓXIMO →
            </button>
          ) : (
            <button
              style={s.btnNext(!canAdvance() || submitting)}
              onClick={() => { if (canAdvance() && !submitting) handleSubmit(); }}
              disabled={!canAdvance() || submitting}
            >
              {submitting ? 'ENVIANDO...' : 'ENVIAR ANAMNESE 🏃'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
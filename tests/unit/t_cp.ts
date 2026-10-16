import assert from 'assert';
import * as L from '/home/user/fitos-final/lib/coachPlanLink';
import { db } from './mocks';
import { POST as register } from '/home/user/fitos-final/app/api/auth/register/route';
import { POST as planSave } from '/home/user/fitos-final/app/api/admin/saas-meta/plan/route';
import { PATCH as userPatch } from '/home/user/fitos-final/app/api/admin/user/[id]/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.message || e)); } };
const reset = () => {
  db.users.length = 0; db.plans.length = 0; db.created.length = 0; db.updates.length = 0;
  db.users.push({ id: 'c-personal', role: 'COACH', accountStatus: 'ACTIVE', inviteCode: 'PERS1', coachPlan: 'PERSONAL' },
                { id: 'c-nutri', role: 'COACH', accountStatus: 'ACTIVE', inviteCode: 'NUT1', coachPlan: 'NUTRICIONISTA' },
                { id: 'c-elite', role: 'COACH', accountStatus: 'ACTIVE', inviteCode: 'ELT1', coachPlan: 'ELITE' },
                { id: 'aluno-1', role: 'USER', coachId: 'c-elite', plan: 'ELITE', studentModules: 'AMBOS' });
  db.plans.push({ id: 'p-treino', coachId: 'c-elite', name: 'Consultoria Gold', description: 'Treino com acompanhamento', modules: 'TREINO', isActive: true },
                { id: 'p-ambos', coachId: 'c-elite', name: 'Completo', description: null, modules: 'AMBOS', isActive: true },
                { id: 'p-off', coachId: 'c-elite', name: 'Antigo', modules: 'AMBOS', isActive: false },
                { id: 'p-outro', coachId: 'c-personal', name: 'Do outro coach', modules: 'TREINO', isActive: true });
};
const req = (body: any, auth?: any, url = 'http://x/api') => { const r: any = { json: async () => body, url }; r.__auth = auth; return r; };
const reg = (extra: any) => register(req({ accountType: 'STUDENT', name: 'Ana', email: 'ana' + Math.random() + '@x.com', password: 'abc12345', inviteCode: 'ELT1', ...extra }) as any) as any;

(async () => {
  await t('módulos: normaliza, limita pelo tipo do coach e escolhe o plano interno', () => {
    assert.equal(L.normalizeModules('dieta'), 'DIETA'); assert.equal(L.normalizeModules('x'), 'TREINO'); assert.equal(L.normalizeModules(undefined), 'TREINO');
    assert.deepEqual(L.allowedModulesFor('PERSONAL'), ['TREINO']); assert.deepEqual(L.allowedModulesFor('NUTRICIONISTA'), ['DIETA']); assert.deepEqual(L.allowedModulesFor('ELITE'), ['TREINO', 'DIETA', 'AMBOS']);
    assert.equal(L.clampModules('AMBOS', 'PERSONAL'), 'TREINO'); assert.equal(L.clampModules('TREINO', 'NUTRICIONISTA'), 'DIETA'); assert.equal(L.clampModules('DIETA', 'ELITE'), 'DIETA'); assert.equal(L.clampModules('AMBOS', 'x', true), 'AMBOS');
    assert.equal(L.internalPlanForModules('TREINO'), 'PERFORMANCE'); assert.equal(L.internalPlanForModules('DIETA'), 'ELITE'); assert.equal(L.internalPlanForModules('AMBOS'), 'ELITE');
    assert.deepEqual(L.studentFieldsFromCoachPlan({ id: 'z', modules: 'AMBOS' }), { plan: 'ELITE', studentModules: 'AMBOS', dietModule: true, coachPlanId: 'z' });
    assert.deepEqual(L.studentFieldsFromCoachPlan({ id: 'z', modules: 'TREINO' }), { plan: 'PERFORMANCE', studentModules: 'TREINO', dietModule: false, coachPlanId: 'z' });
  });
  await t('cadastro pelo link do plano do coach: aluno entra no plano (nome, módulos, plano interno), o ID nunca vai para o campo plan', async () => {
    reset(); const r = await reg({ plan: 'p-ambos' }); assert.equal(r.status, 201, JSON.stringify(r.body));
    const u = db.created[0]; assert.equal(u.plan, 'ELITE'); assert.equal(u.studentModules, 'AMBOS'); assert.equal(u.dietModule, true); assert.equal(u.coachPlanId, 'p-ambos'); assert.equal(u.coachId, 'c-elite');
    assert.equal(r.body.user.coachPlanInfo.name, 'Completo'); assert.equal(r.body.user.coachPlanInfo.modules, 'AMBOS');
    reset(); await reg({ plan: 'p-treino' }); const v = db.created[0]; assert.equal(v.plan, 'PERFORMANCE'); assert.equal(v.studentModules, 'TREINO'); assert.equal(v.dietModule, false);
  });
  await t('plano de OUTRO coach, plano inativo ou código inventado não entram: caem no padrão e nada estranho é gravado em plan', async () => {
    for (const bogus of ['p-outro', 'p-off', 'e1f2-uuid-inventado', '<script>']) { reset(); const r = await reg({ plan: bogus }); assert.equal(r.status, 201); const u = db.created[0]; assert.equal(u.plan, 'PREMIUM', bogus); assert.equal(u.coachPlanId, undefined, bogus); assert.equal(r.body.user.coachPlanInfo, null); }
  });
  await t('planos do sistema continuam como antes (links antigos): ELITE, PERFORMANCE, FICHA_8S (anamnese pendente), sem plano = PREMIUM', async () => {
    for (const [p, exp] of [['ELITE', 'ELITE'], ['PERFORMANCE', 'PERFORMANCE'], ['FICHA_8S', 'FICHA_8S'], [undefined, 'PREMIUM']] as any) { reset(); await reg({ plan: p }); const u = db.created[0]; assert.equal(u.plan, exp); assert.equal(u.coachPlanId, undefined); if (p === 'FICHA_8S') assert.equal(u.anamnesePendente, true); }
  });
  await t('coach cria plano com módulos: Personal não consegue pôr dieta, Nutri só dieta, Elite livre; descrição é limpa e limitada', async () => {
    reset();
    let r: any = await planSave(req({ coachId: 'c-personal', name: 'A', value: '100', durationInMonths: 1, modules: 'AMBOS', description: '  boa  ' }, { id: 'c-personal' }) as any); assert.equal(r.body.plan.modules, 'TREINO'); assert.equal(r.body.plan.description, 'boa');
    r = await planSave(req({ coachId: 'c-nutri', name: 'B', value: '100', modules: 'TREINO' }, { id: 'c-nutri' }) as any); assert.equal(r.body.plan.modules, 'DIETA');
    r = await planSave(req({ coachId: 'c-elite', name: 'C', value: '100', modules: 'DIETA', description: 'x'.repeat(900) }, { id: 'c-elite' }) as any); assert.equal(r.body.plan.modules, 'DIETA'); assert.equal(r.body.plan.description.length, 400);
    r = await planSave(req({ coachId: 'c-elite', name: 'D', value: '100' }, { id: 'c-elite' }) as any); assert.equal(r.body.plan.modules, 'TREINO', 'sem módulo = só treino');
    r = await planSave(req({ planId: 'p-treino', name: 'Gold 2', value: '90', modules: 'AMBOS' }, { id: 'c-elite' }) as any); assert.equal(r.body.plan.modules, 'AMBOS'); assert.equal(r.body.plan.description, 'Treino com acompanhamento', 'editar sem mandar descrição não apaga a que já existe');
    r = await planSave(req({ planId: 'p-treino', name: 'Gold 3', value: '90' }, { id: 'c-personal' }) as any); assert.equal(r.status, 403, 'outro coach não edita o plano');
  });
  await t('coach atribui um plano dele ao aluno: módulos, plano interno e vínculo mudam juntos', async () => {
    reset();
    let r: any = await userPatch(req({ coachPlanId: 'p-treino' }, { id: 'c-elite' }) as any, { params: { id: 'aluno-1' } } as any); assert.equal(r.status, 200, JSON.stringify(r.body));
    let a = db.users.find((x: any) => x.id === 'aluno-1'); assert.equal(a.coachPlanId, 'p-treino'); assert.equal(a.studentModules, 'TREINO'); assert.equal(a.plan, 'PERFORMANCE'); assert.equal(a.dietModule, false);
    r = await userPatch(req({ coachPlanId: 'p-ambos' }, { id: 'c-elite' }) as any, { params: { id: 'aluno-1' } } as any); a = db.users.find((x: any) => x.id === 'aluno-1'); assert.equal(a.studentModules, 'AMBOS'); assert.equal(a.plan, 'ELITE'); assert.equal(a.dietModule, true);
    r = await userPatch(req({ coachPlanId: null }, { id: 'c-elite' }) as any, { params: { id: 'aluno-1' } } as any); a = db.users.find((x: any) => x.id === 'aluno-1'); assert.equal(a.coachPlanId, null); assert.equal(a.studentModules, 'AMBOS', 'tirar o vínculo não mexe nos módulos');
  });
  await t('atribuição bloqueada: plano de outro coach, plano inativo, o próprio aluno se auto-promovendo, coach que não é dono', async () => {
    reset();
    let r: any = await userPatch(req({ coachPlanId: 'p-outro' }, { id: 'c-elite' }) as any, { params: { id: 'aluno-1' } } as any); assert.equal(r.status, 400);
    r = await userPatch(req({ coachPlanId: 'p-off' }, { id: 'c-elite' }) as any, { params: { id: 'aluno-1' } } as any); assert.equal(r.status, 400);
    r = await userPatch(req({ coachPlanId: 'p-ambos', plan: 'ELITE' }, { id: 'aluno-1' }) as any, { params: { id: 'aluno-1' } } as any); assert.equal(r.status, 403);
    r = await userPatch(req({ coachPlanId: 'p-treino' }, { id: 'c-personal' }) as any, { params: { id: 'aluno-1' } } as any); assert.equal(r.status, 403);
    assert.equal(db.updates.length, 0, 'nada foi gravado em nenhuma tentativa bloqueada');
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();

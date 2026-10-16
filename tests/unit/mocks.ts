// mocks do servidor para testar as rotas sem banco
export const db: any = { users: [], plans: [], created: [], updates: [] };
const match = (row: any, where: any) => Object.entries(where || {}).every(([k, v]) => (v && typeof v === 'object' && 'not' in (v as any)) ? row[k] !== (v as any).not : row[k] === v);
const prisma: any = {
  user: {
    findFirst: async ({ where }: any) => db.users.find((u: any) => match(u, where)) ?? null,
    findUnique: async ({ where, select }: any) => db.users.find((u: any) => match(u, where)) ?? null,
    count: async ({ where }: any) => db.users.filter((u: any) => match(u, where)).length,
    create: async ({ data }: any) => { const u = { id: 'new-' + (db.created.length + 1), ...data }; db.created.push(u); db.users.push(u); return u; },
    update: async ({ where, data }: any) => { const u = db.users.find((x: any) => x.id === where.id); db.updates.push({ where, data }); Object.assign(u, data); return u; },
  },
  coachPlan: {
    findFirst: async ({ where }: any) => db.plans.find((p: any) => match(p, where)) ?? null,
    findUnique: async ({ where }: any) => db.plans.find((p: any) => p.id === where.id) ?? null,
    create: async ({ data }: any) => { const p = { id: 'cp-' + (db.plans.length + 1), isActive: true, ...data }; db.plans.push(p); return p; },
    update: async ({ where, data }: any) => { const p = db.plans.find((x: any) => x.id === where.id); Object.assign(p, data); return p; },
  },
};
export default prisma;

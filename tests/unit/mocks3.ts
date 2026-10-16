export const state: any = { users: [] };
const match = (u: any, where: any): boolean => Object.entries(where || {}).every(([k, v]: any) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('not' in v) return u[k] !== v.not && !(v.not === null && (u[k] === null || u[k] === undefined));
    if ('in' in v) return v.in.includes(u[k]);
  }
  if (v === null) return u[k] === null || u[k] === undefined;
  return u[k] === v;
});
const prisma: any = { user: {
  findUnique: async ({ where }: any) => state.users.find((u: any) => u.id === where.id) ?? null,
  findMany: async ({ where, orderBy }: any) => { const dir = orderBy && orderBy.androidTesterAt === 'desc' ? -1 : 1; const l = state.users.filter((u: any) => match(u, where)); return orderBy ? l.sort((a: any, b: any) => dir * (+new Date(a.androidTesterAt) - +new Date(b.androidTesterAt))) : l; },
  update: async ({ where, data }: any) => { const u = state.users.find((x: any) => x.id === where.id); if (!u) throw new Error('P2025'); state.lastUpdate = data; Object.assign(u, data); return u; },
  updateMany: async ({ where, data }: any) => { const l = state.users.filter((u: any) => match(u, where)); l.forEach((u: any) => Object.assign(u, data)); state.lastWhere = where; return { count: l.length }; },
} };
export default prisma;
export const requireAuth = (req: any) => req.__user ? { user: req.__user } : { response: { status: 401, body: { error: 'Não autenticado.' } } };
export const requireMaster = (req: any) => !req.__user ? { response: { status: 401, body: { error: 'Não autenticado.' } } } : req.__user.id === 'master' ? { user: req.__user } : { response: { status: 403, body: { error: 'Acesso restrito ao time master.' } } };

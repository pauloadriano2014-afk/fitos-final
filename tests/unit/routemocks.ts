export const state: any = { users: [], updates: [], pushes: [] };
const prisma: any = { user: {
  findUnique: async ({ where }: any) => state.users.find((u: any) => (where.id !== undefined ? u.id === where.id : u.email === where.email)) ?? null,
  create: async ({ data }: any) => { const u = { id: 'new' + (state.users.length + 1), createdAt: new Date(), ...data }; state.users.push(u); state.creates = (state.creates || []).concat([data]); return u; },
  findFirst: async ({ where }: any) => state.users.find((u: any) => where.inviteCode && u.inviteCode === where.inviteCode && !(where.NOT && where.NOT.id === u.id)) ?? null,
  update: async ({ where, data }: any) => { const u = state.users.find((x: any) => x.id === where.id); state.updates.push(data); Object.assign(u, data); return u; },
} };
export default prisma;
export const requireMaster = () => ({ user: { id: 'master' } });
export const isMasterId = (id: any) => id === 'master';
export const sendPushToUser = async (_u: any, title: string, body: string) => { state.pushes.push({ title, body }); };
export const signAuthToken = () => 'tok';

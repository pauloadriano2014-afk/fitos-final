const calls = [];
const rows = [
  { id: 'n3', title: 'C', active: true,  date: '2026-09-30T00:09:00Z', coachId: 'coach1' },
  { id: 'n2', title: 'B', active: false, date: '2026-09-29T22:57:00Z', coachId: 'coach1' },
  { id: 'n1', title: 'A', active: false, date: '2026-09-01T12:00:00Z', coachId: 'coach1' },
];
const students = {
  aluno1:   { coachId: 'coach1', createdAt: new Date('2026-08-01T00:00:00Z') }, // entrou antes de tudo
  recente:  { coachId: 'coach1', createdAt: new Date('2026-09-15T00:00:00Z') }, // entrou depois do n1
  novissimo:{ coachId: 'coach1', createdAt: new Date('2026-10-05T00:00:00Z') }, // entrou depois de todos
  semdata:  { coachId: 'coach1', createdAt: null },
  orfao:    { coachId: null, createdAt: new Date('2026-08-01T00:00:00Z') },
};
const prisma = {
  __calls: calls,
  user: { findUnique: async ({ where }) => students[where.id] || students.aluno1 },
  notice: { findMany: async (args) => {
    calls.push(args);
    const w = args.where;
    let out = rows.filter((r) => r.coachId === w.coachId
      && (w.active === undefined || r.active === w.active)
      && (!w.date || !w.date.gte || new Date(r.date) >= w.date.gte));
    return out.slice(0, args.take ?? 999);
  } },
};
module.exports = prisma; module.exports.default = prisma;

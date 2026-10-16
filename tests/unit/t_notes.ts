// (reconstruído a partir do bundle compilado em 12 out 2026: o arquivo original foi sobrescrito por engano)
import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { PATCH } from '/home/user/fitos-final/app/api/admin/alerts/[id]/route';
import { PATCH as PATCH2 } from '/home/user/fitos-final/app/api/admin/workout-history/[id]/resolve/route';
import { POST } from '/home/user/fitos-final/app/api/student-messages/route';
import { POST as POST2 } from '/home/user/fitos-final/app/api/equipment-report/route';
import { resolveExerciseNote, resolveHistoryNotesForAlert } from '/home/user/fitos-final/lib/noteSync';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
const import_assert = { default: assert }; const import_jsonwebtoken2 = { default: jwt }; const import_prisma11 = { default: prisma };
var P = import_prisma11.default;
var S = P.__state;
var SECRET = "dev-only-troque-isso-configurando-JWT_SECRET-no-env";
var tok = (id, role = "COACH") => import_jsonwebtoken2.default.sign({ id, role, coachId: null }, SECRET);
var call = async (fn, url, as, init = {}, ctx) => {
  const headers = { "content-type": "application/json" };
  if (as) headers.authorization = "Bearer " + as;
  const r = await fn(new Request("http://x" + url, { ...init, headers: { ...headers, ...init.headers || {} } }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
var post = (o) => ({ method: "POST", body: JSON.stringify(o) });
var patch = (o) => ({ method: "PATCH", body: JSON.stringify(o) });
var pushes = () => globalThis.__pushes || [];
var clearPushes = () => {
  globalThis.__pushes = [];
};
var cA = tok("cA");
var cB = tok("cB");
var s1 = tok("s1", "USER");
var s2 = tok("s2", "USER");
var master = tok(PAULO_ID, "ADMIN");
var seed = () => {
  P.__reset();
  clearPushes();
  const u = (o) => S.user.push({ role: "USER", active: true, isFinanceActive: true, isTestAccount: false, name: o.id, phone: null, photoUrl: null, coachId: null, nutritionistId: null, ...o });
  u({ id: PAULO_ID, role: "ADMIN", name: "Paulo Master", pushToken: "ExponentPushToken[paulo]" });
  u({ id: "cA", role: "COACH", name: "Coach A", pushToken: "ExponentPushToken[cA]" });
  u({ id: "cB", role: "COACH", name: "Coach B" });
  u({ id: "s1", name: "Samara Franco", coachId: "cA", pushToken: "ExponentPushToken[s1]" });
  u({ id: "s2", name: "Bia Costa", coachId: "cB", pushToken: "ExponentPushToken[s2]" });
  u({ id: "s3", name: "Carla Dias", coachId: "cA" });
  const ex = (id, name, category, extra = {}) => S.exercise.push({ id, name, category, subCategory: "Geral", defaultSubstitutes: [], videoUrl: null, coachId: "cA", tags: null, ...extra });
  ex("e1", "Cadeira adutora", "PERNAS");
  ex("e2", "Leg press", "PERNAS");
  ex("e3", "Agachamento livre", "PERNAS");
  ex("e4", "Afundo", "PERNAS");
  ex("e5", "Supino reto", "PEITO");
  ex("e6", "Crucifixo", "PEITO");
  ex("e7", "Esteira", "CARDIO");
  ex("e8", "Panturrilha no banco", "PANTURRILHA");
};
var fails = 0;
var passed = 0;
var block = async (name, fn) => {
  try {
    seed();
    await fn();
    passed++;
    console.log("  ok  " + name);
  } catch (e) {
    fails++;
    console.log("  FALHOU  " + name + "\n        " + String(e && e.message || e).split("\n").slice(0, 6).join("\n        "));
  }
};
(async () => {
  const msg = (as, o = {}) => call(POST, "/api/student-messages", as, post({ studentId: "s1", kind: "AJUSTE_TREINO", title: "Ajustei o seu treino A", body: "Tirei X.", workoutId: "w1", day: "A", followUp: true, ...o }));
  const report = (as, o = {}) => call(POST2, "/api/equipment-report", as, post({ exerciseId: "e1", workoutId: "w1", day: "A", note: "n\xE3o tem na academia", ...o }));
  const H = 36e5;
  const FIN = new Date(Date.now() - 2 * 864e5);
  const mkHistory = (o = {}) => {
    const h = { id: "wh1", userId: "s1", date: FIN, name: "Treino", day: "A", workoutId: "w1", user: { id: "s1", name: "Samara", coachId: "cA", pushToken: "ExponentPushToken[s1]" }, ...o };
    S.workoutHistory.push(h);
    return h;
  };
  const mkEx = (id, o = {}) => S.exerciseHistory.push({ id, workoutHistoryId: "wh1", exerciseId: "e1", exerciseName: "B\xEDceps scott m\xE1quina", setNumber: 1, note: "N\xE3o tem esse aparelho aqui", resolvedAt: null, coachReply: null, coachReplyAt: null, ...o });
  const mkAlert = (id, o = {}) => S.studentAlert.push({ id, userId: "s1", coachId: "cA", type: "EXERCISE_NOTE", title: "t", message: "N\xE3o tem esse aparelho aqui", exerciseName: "B\xEDceps scott m\xE1quina", isRead: false, createdAt: new Date(FIN.getTime() - 3 * H), ...o });
  const alert = (as, id, o) => call(PATCH, `/api/admin/alerts/${id}`, as, patch(o), { params: { id } });
  const resolveHist = (as, o, id = "wh1") => call(PATCH2, `/api/admin/workout-history/${id}/resolve`, as, patch(o), { params: { id } });
  const base = () => {
    mkHistory();
    mkEx("x1");
    mkEx("x2", { setNumber: 2 });
    mkEx("x3", { setNumber: 3 });
    mkEx("y1", { exerciseId: "e2", exerciseName: "Leg press", note: "pesado" });
    mkAlert("a1");
    mkAlert("a2", { exerciseName: "Leg press", message: "pesado" });
  };
  await block("responder o AVISO IMEDIATO (Feed/A FAZER) tamb\xE9m resolve o cart\xE3o do Prontu\xE1rio, com a mesma resposta, em todas as s\xE9ries \u2014 e s\xF3 daquele exerc\xEDcio", async () => {
    base();
    const r = await alert(cA, "a1", { reply: "Troquei por rosca na polia." });
    import_assert.default.strictEqual(r.status, 200, JSON.stringify(r.json));
    const bic = S.exerciseHistory.filter((x) => x.exerciseName === "B\xEDceps scott m\xE1quina");
    import_assert.default.ok(bic.every((x) => x.resolvedAt && x.coachReply === "Troquei por rosca na polia." && x.coachReplyAt), JSON.stringify(bic));
    import_assert.default.strictEqual(S.exerciseHistory.find((x) => x.id === "y1").resolvedAt, null);
    import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === "a2").isRead, false);
  });
  await block("marcar o aviso imediato como visto resolve o cart\xE3o (sem resposta); desmarcar n\xE3o mexe; outro tipo de alerta n\xE3o mexe", async () => {
    base();
    mkAlert("a3", { type: "AI_STAGNATION", exerciseName: "B\xEDceps scott m\xE1quina" });
    await alert(cA, "a3", { isRead: true });
    import_assert.default.ok(S.exerciseHistory.every((x) => !x.resolvedAt));
    await alert(cA, "a1", { isRead: false });
    import_assert.default.ok(S.exerciseHistory.every((x) => !x.resolvedAt));
    await alert(cA, "a1", { isRead: true });
    const bic = S.exerciseHistory.filter((x) => x.exerciseName === "B\xEDceps scott m\xE1quina");
    import_assert.default.ok(bic.every((x) => x.resolvedAt && !x.coachReply));
  });
  await block("a sincroniza\xE7\xE3o respeita o aluno e a janela de tempo: coment\xE1rio de outro aluno, de outro treino (dias depois) ou j\xE1 resolvido n\xE3o \xE9 tocado", async () => {
    base();
    S.workoutHistory.push({ id: "wh2", userId: "s2", date: FIN, user: { id: "s2", coachId: "cB" } });
    S.exerciseHistory.push({ id: "z1", workoutHistoryId: "wh2", exerciseName: "B\xEDceps scott m\xE1quina", note: "igual", resolvedAt: null });
    S.workoutHistory.push({ id: "wh3", userId: "s1", date: new Date(FIN.getTime() + 5 * 864e5), user: { id: "s1", coachId: "cA" } });
    S.exerciseHistory.push({ id: "z2", workoutHistoryId: "wh3", exerciseName: "B\xEDceps scott m\xE1quina", note: "outro dia", resolvedAt: null });
    const done = /* @__PURE__ */ new Date("2026-01-01");
    S.exerciseHistory.find((x) => x.id === "x3").resolvedAt = done;
    S.exerciseHistory.find((x) => x.id === "x3").coachReply = "antiga";
    await alert(cA, "a1", { reply: "nova" });
    import_assert.default.strictEqual(S.exerciseHistory.find((x) => x.id === "z1").resolvedAt, null);
    import_assert.default.strictEqual(S.exerciseHistory.find((x) => x.id === "z2").resolvedAt, null);
    const x3 = S.exerciseHistory.find((x) => x.id === "x3");
    import_assert.default.strictEqual(x3.resolvedAt, done);
    import_assert.default.strictEqual(x3.coachReply, "antiga");
    import_assert.default.ok(S.exerciseHistory.filter((x) => ["x1", "x2"].includes(x.id)).every((x) => x.coachReply === "nova"));
  });
  await block("exerc\xEDcio sem nota no hist\xF3rico: responder o aviso n\xE3o quebra nada", async () => {
    mkHistory();
    mkAlert("a1");
    const r = await alert(cA, "a1", { reply: "ok" });
    import_assert.default.strictEqual(r.status, 200);
    import_assert.default.strictEqual(r.json.replied, true);
    mkAlert("a9", { exerciseName: null });
    import_assert.default.strictEqual((await alert(cA, "a9", { reply: "ok" })).status, 200);
  });
  await block("resolver o cart\xE3o do Prontu\xE1rio resolve as outras s\xE9ries e tira o aviso imediato da fila (e vice-versa n\xE3o duplica o push)", async () => {
    base();
    const r = await resolveHist(cA, { exerciseHistoryId: "x1", reply: "Troquei por rosca." });
    import_assert.default.strictEqual(r.status, 200, JSON.stringify(r.json));
    import_assert.default.ok(S.exerciseHistory.filter((x) => x.exerciseName === "B\xEDceps scott m\xE1quina").every((x) => x.resolvedAt && x.coachReply === "Troquei por rosca."));
    import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === "a1").isRead, true);
    import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === "a2").isRead, false);
    import_assert.default.strictEqual(S.exerciseHistory.find((x) => x.id === "y1").resolvedAt, null);
    import_assert.default.strictEqual(pushes().length, 1);
    import_assert.default.ok(/respondeu sobre "Bíceps scott máquina"/.test(pushes()[0].title));
  });
  await block("resolver o cart\xE3o sem resposta tamb\xE9m tira o aviso imediato; s\xF3 os avisos DAQUELE treino (janela) saem da fila", async () => {
    base();
    mkAlert("a5", { createdAt: new Date(FIN.getTime() - 30 * H) });
    await resolveHist(cA, { exerciseHistoryId: "x1" });
    import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === "a1").isRead, true);
    import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === "a5").isRead, false);
    import_assert.default.ok(S.exerciseHistory.filter((x) => x.exerciseName === "B\xEDceps scott m\xE1quina").every((x) => x.resolvedAt && !x.coachReply));
  });
  await block("resolver com silent n\xE3o manda push; o feedback geral do treino segue como antes; outro coach 403", async () => {
    base();
    await resolveHist(cA, { exerciseHistoryId: "x1", reply: "ok", silent: true });
    import_assert.default.strictEqual(pushes().length, 0);
    import_assert.default.strictEqual((await resolveHist(cB, { exerciseHistoryId: "y1" })).status, 403);
    const g = await resolveHist(cA, { reply: "valeu" });
    import_assert.default.strictEqual(g.status, 200);
    import_assert.default.ok(S.workoutHistory[0].feedbackResolvedAt);
    import_assert.default.strictEqual(pushes().length, 1);
    import_assert.default.strictEqual((await resolveHist(cA, { exerciseHistoryId: "nao" })).status, 404);
  });
  await block("mensagem de troca que RESOLVE o coment\xE1rio: grava a mensagem, resolve o cart\xE3o e o aviso imediato com o texto como resposta; push s\xF3 da mensagem", async () => {
    base();
    const r = await msg(cA, { kind: "APARELHO_TROCADO", title: "Troquei B\xEDceps scott m\xE1quina", body: "Troquei por rosca na polia.", workoutId: "w1", day: "A", followUp: false, resolveNote: { workoutHistoryId: "wh1", exerciseHistoryId: "x1" } });
    import_assert.default.strictEqual(r.status, 200, JSON.stringify(r.json));
    import_assert.default.strictEqual(r.json.resolvedNote, true);
    import_assert.default.strictEqual(S.studentCoachMessage.length, 1);
    import_assert.default.ok(S.exerciseHistory.filter((x) => x.exerciseName === "B\xEDceps scott m\xE1quina").every((x) => x.resolvedAt && x.coachReply === "Troquei por rosca na polia."));
    import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === "a1").isRead, true);
    import_assert.default.strictEqual(pushes().length, 1);
    import_assert.default.strictEqual(pushes()[0].data.type, "coach_message");
  });
  await block("mensagem com coment\xE1rio que n\xE3o existe / de outro aluno: 404 e NADA \xE9 enviado nem resolvido", async () => {
    base();
    S.workoutHistory.push({ id: "wh9", userId: "s3", date: FIN, user: { id: "s3", coachId: "cA" } });
    S.exerciseHistory.push({ id: "q9", workoutHistoryId: "wh9", exerciseName: "Leg press", note: "x", resolvedAt: null });
    import_assert.default.strictEqual((await msg(cA, { resolveNote: { workoutHistoryId: "wh1", exerciseHistoryId: "nao" } })).status, 404);
    import_assert.default.strictEqual((await msg(cA, { resolveNote: { workoutHistoryId: "wh9", exerciseHistoryId: "q9" } })).status, 404);
    import_assert.default.strictEqual((await msg(cA, { resolveNote: { workoutHistoryId: "wh1", exerciseHistoryId: "q9" } })).status, 404);
    import_assert.default.strictEqual(S.studentCoachMessage.length, 0);
    import_assert.default.strictEqual(pushes().length, 0);
    import_assert.default.ok(S.exerciseHistory.every((x) => !x.resolvedAt));
    import_assert.default.strictEqual((await msg(cA, {})).status, 200);
  });
  await block("coach registrando o aparelho pelo Prontu\xE1rio n\xE3o recebe push dele mesmo; o aluno avisando sim", async () => {
    const r1 = await report(cA, { userId: "s1" });
    import_assert.default.strictEqual(r1.status, 200);
    import_assert.default.strictEqual(pushes().length, 0);
    S.equipmentReport.length = 0;
    const r2 = await report(s1);
    import_assert.default.strictEqual(r2.status, 200);
    import_assert.default.strictEqual(pushes().length, 1);
    const r3 = await report(master, { userId: "s1", exerciseId: "e2" });
    import_assert.default.strictEqual(r3.status, 200);
    import_assert.default.strictEqual(pushes().length, 2);
  });
  await block("resolver o cart\xE3o s\xF3 tira da fila o aviso CERTO: tipo de alerta, aluno e hor\xE1rio (antes/depois do treino) \u2014 e n\xE3o reescreve linha j\xE1 resolvida", async () => {
    base();
    mkAlert("b1", { type: "AI_STAGNATION" });
    mkAlert("b2", { userId: "s2" });
    mkAlert("b3", { createdAt: new Date(FIN.getTime() + 5 * H) });
    mkAlert("b4", { createdAt: new Date(FIN.getTime() + 2 * 864e5) });
    const done = /* @__PURE__ */ new Date("2026-01-01");
    const x3 = S.exerciseHistory.find((x) => x.id === "x3");
    x3.resolvedAt = done;
    x3.coachReply = "antiga";
    await resolveHist(cA, { exerciseHistoryId: "x1", reply: "nova" });
    for (const id of ["b1", "b2", "b3", "b4"]) import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === id).isRead, false, id);
    import_assert.default.strictEqual(S.studentAlert.find((a) => a.id === "a1").isRead, true);
    import_assert.default.strictEqual(x3.resolvedAt, done);
    import_assert.default.strictEqual(x3.coachReply, "antiga");
    import_assert.default.strictEqual(S.exerciseHistory.find((x) => x.id === "x2").coachReply, "nova");
  });
  await block("noteSync direto: devolve s\xF3 quantos avisos N\xC3O lidos sa\xEDram da fila; resposta \xE9 aparada e limitada a 1000 letras; falha numa parte n\xE3o derruba a outra", async () => {
    base();
    S.studentAlert.find((a) => a.id === "a1").isRead = true;
    const wh = { id: "wh1", userId: "s1", date: FIN };
    import_assert.default.strictEqual(await resolveExerciseNote({ workoutHistory: wh, exerciseName: "B\xEDceps scott m\xE1quina", reply: "   " + "a".repeat(2e3) + "   " }), 0);
    const line = S.exerciseHistory.find((x) => x.id === "x1");
    import_assert.default.strictEqual(line.coachReply.length, 1e3);
    import_assert.default.ok(line.coachReply.startsWith("a"));
    mkAlert("c1");
    import_assert.default.strictEqual(await resolveExerciseNote({ workoutHistory: wh, exerciseName: "B\xEDceps scott m\xE1quina" }), 1);
    const broken = { exerciseHistory: { updateMany: async () => {
      throw new Error("banco fora");
    } }, studentAlert: { updateMany: async () => ({ count: 2 }) } };
    import_assert.default.strictEqual(await resolveExerciseNote({ workoutHistory: wh, exerciseName: "X", reply: "ok" }, broken), 2);
    const brokenAll = { exerciseHistory: broken.exerciseHistory, studentAlert: { updateMany: async () => {
      throw new Error("banco fora");
    } } };
    import_assert.default.strictEqual(await resolveExerciseNote({ workoutHistory: wh, exerciseName: "X" }, brokenAll), 0);
    import_assert.default.strictEqual(await resolveHistoryNotesForAlert({ userId: "s1", exerciseName: "X", createdAt: FIN }, "ok", { workoutHistory: { findMany: async () => {
      throw new Error("banco fora");
    } } }), 0);
  });
  await block("aviso imediato respondido: s\xF3 as linhas COM coment\xE1rio daquele exerc\xEDcio, e aviso sem nome de exerc\xEDcio n\xE3o resolve nada", async () => {
    base();
    mkEx("x4", { setNumber: 4, note: null });
    await alert(cA, "a1", { reply: "ok" });
    import_assert.default.strictEqual(S.exerciseHistory.find((x) => x.id === "x4").resolvedAt, null);
    import_assert.default.ok(S.exerciseHistory.find((x) => x.id === "x1").resolvedAt);
    import_assert.default.strictEqual(await resolveHistoryNotesForAlert({ userId: "s1", exerciseName: void 0, createdAt: new Date(FIN.getTime() - 3 * H) }, "x"), 0);
    import_assert.default.strictEqual(await resolveHistoryNotesForAlert({ userId: "s1", exerciseName: null, createdAt: new Date(FIN.getTime() - 3 * H) }, "x"), 0);
    import_assert.default.strictEqual(S.exerciseHistory.find((x) => x.id === "y1").resolvedAt, null);
    S.exerciseHistory.forEach((x) => {
      x.resolvedAt = null;
      x.coachReply = null;
    });
    import_assert.default.strictEqual(await resolveHistoryNotesForAlert({ userId: "s1", exerciseName: void 0, createdAt: new Date(FIN.getTime() - 3 * H) }, "x"), 0);
    import_assert.default.ok(S.exerciseHistory.every((x) => !x.resolvedAt));
  });
  await block("silent s\xF3 vale quando \xE9 exatamente true", async () => {
    base();
    await resolveHist(cA, { exerciseHistoryId: "x1", reply: "ok", silent: "sim" });
    import_assert.default.strictEqual(pushes().length, 1);
  });
  await block("o aluno nunca recebe sugest\xE3o de troca ao avisar que n\xE3o tem o aparelho (nem com ficha, dia e substitutos cadastrados)", async () => {
    S.exercise.find((x) => x.id === "e1").defaultSubstitutes = ["e2", "e3"];
    S.workoutExercise.push({ id: "we1", workoutId: "w1", exerciseId: "e1", day: "A", substitutes: ["e3"], substituteId: "e2" });
    const r = await report(s1, { workoutId: "w1", day: "A", workoutExerciseId: "we1" });
    import_assert.default.strictEqual(r.status, 200);
    import_assert.default.deepStrictEqual(r.json.substitutes, []);
    import_assert.default.strictEqual(r.json.success, true);
    import_assert.default.ok(r.json.report && r.json.report.id);
    import_assert.default.strictEqual(S.equipmentReport.length, 1);
    import_assert.default.strictEqual(pushes().length, 1);
  });
  console.log(`
${passed} ok, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
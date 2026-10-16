import * as M from '/home/user/fitos-final/lib/monthlyReport';
const RAW = `2026-08-12T19:18:43.522Z||42|5b44,7ea9,9a9e,c1c2,e657
2026-08-12T19:18:43.695Z||43|5b44,7ea9,9a9e,c1c2,e657
2026-08-13T17:33:10.223Z||7360|2345,45b5,5c89,ad77
2026-08-15T15:29:47.419Z||103|0d51,1dde,2022,8a8f,9a7b
2026-08-17T22:45:46.069Z||273|0766,6334,8fc2,de5a,f225,ff8e
2026-08-28T02:43:25.277Z||1|
2026-09-02T03:16:48.451Z||551|0bfa,6334,8a8f,8fc2,bbaa,de5a
2026-09-03T16:31:30.747Z||81|0bfa,2345,6528,79b7,ecb0
2026-09-04T17:44:23.755Z||3187|
2026-09-04T19:03:03.879Z||79|0a9f,23e6,5cd6,781c,a21d,ac78,de79
2026-09-04T19:03:04.449Z||79|0a9f,23e6,5cd6,781c,a21d,ac78,de79
2026-09-06T13:03:03.159Z||1153|5c89,7174,8a8f,b89f,e1af
2026-09-06T13:03:03.682Z||1153|5c89,7174,8a8f,b89f,e1af
2026-09-09T14:13:31.605Z||2682|0bfa,6334,8a8f,8fc2,bbaa
2026-09-09T19:53:35.455Z||108|607a,9ac1,ad74,e1af
2026-09-10T19:15:31.064Z||80|11b9,5dce,8e76,c970,dfb9
2026-09-12T13:47:26.636Z||1178|0bfa,3d0d,6528,bfac
2026-09-12T19:04:12.930Z||226|0666,41c5,cb7a,cc97,e704
2026-09-14T17:27:29.090Z||11438|
2026-09-14T19:18:35.802Z||82|0bfa,2345,6528,ecb0
2026-09-16T17:10:57.295Z||1388|0a9f,23e6,5cd6,781c,a21d,de79
2026-09-16T19:13:46.780Z||80|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:46.798Z||80|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:46.823Z||79|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:46.860Z||80|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:46.934Z||79|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:46.935Z||79|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:46.935Z||79|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:47.136Z||79|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:47.139Z||80|0bfa,6334,8a8f,bbaa
2026-09-16T19:13:47.343Z||80|0bfa,6334,8a8f,bbaa
2026-09-18T03:03:18.094Z||536|1a91,574f,78e2,e5fd,ec50
2026-09-19T15:09:04.288Z||71|41c5,79a9,9412
2026-09-23T19:32:00.718Z||88|0bfa,3d0d,6528,8a8f,bfac
2026-09-29T08:49:08.400Z||15270|2345,ad77
2026-10-01T08:48:17.084Z|PERNAS¹|2860|0bfa,2345,6528,ecb0
2026-10-01T08:49:16.395Z|OMBROS|1|
2026-10-01T10:32:49.428Z|PERNAS²|89|0bfa,6334,7a15`;
const hs = RAW.split('\n').map((l, i) => { const [date, day, dur, ids] = l.split('|'); return { id: 'h' + i, date, day: day || null, duration: Number(dur), rpe: 8, details: ids ? ids.split(',').map((e) => ({ exerciseId: e, exerciseName: e, setNumber: 1, weight: 20, reps: '10' })) : [] }; });
const now = new Date('2026-10-07T21:00:00Z');
const win = (d: number) => { const end = M.startOfBrtDay('2026-10-07').getTime() + 86400000; const start = end - d * 86400000; return { cur: hs.filter((h) => new Date(h.date).getTime() >= start && new Date(h.date).getTime() < end), prev: hs.filter((h) => new Date(h.date).getTime() >= start - d * 86400000 && new Date(h.date).getTime() < start) }; };
for (const d of [30, 60]) {
  const { cur, prev } = win(d);
  const before = cur.length;
  const r = M.computeMonthlyReport({ now, days: d, student: { name: 'Aluna', coachId: 'c' }, histories: cur as any, prevHistories: prev as any, baselineMax: {}, categories: {}, checkins: [], plannedPerWeek: 8 } as any);
  console.log(`${d} dias: antes ${before} treinos -> agora ${r.training.sessions} (dias treinados ${r.training.trainedDays}, por semana ${r.training.avgPerWeek}, perWeek ${JSON.stringify(r.training.perWeek)}, tempo médio ${r.training.avgMinutes}, período anterior ${r.training.prevSessions})`);
}

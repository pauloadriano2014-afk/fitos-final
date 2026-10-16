import assert from 'assert';
import fs from 'fs';
// os textos que o aluno e o coach LEEM (push, perguntas, WhatsApp, janela do aluno) não podem ter o coração roxo
const read = (p: string) => fs.readFileSync(p, 'utf8');
const strip = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '')).join('\n');
const files = [
  '/home/user/fitos-final/app/api/admin/weekly-feedback/nudge/route.ts',
  '/home/user/fitos-final/app/api/user/weekly-feedback/route.ts',
  '/home/user/fitos-final/lib/weeklyCron.ts',
  '/home/user/fitos-final/lib/weeklyQuestions.ts',
  '/home/user/fitos-final/lib/weeklyWhatsApp.ts',
  '/home/user/FIT-OS-FRONTEND/src/components/HomeWeeklyFeedback.js',
  '/home/user/FIT-OS-FRONTEND/src/components/WeeklyQuestionsForm.js',
  '/home/user/FIT-OS-FRONTEND/src/utils/weeklyFeedback.js',
];
for (const f of files) { assert.ok(!strip(read(f)).includes('💜'), `coração roxo em texto visível: ${f}`); }
console.log('OK  nenhum coração roxo nos textos visíveis do feedback da semana (' + files.length + ' arquivos)');

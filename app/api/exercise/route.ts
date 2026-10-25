// app/api/exercise/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { PAULO_ID, ADRI_ID, MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { visibleLibraryWhere, hiddenFlagFromBody } from '@/lib/exerciseVisibility';
import { guessEquipment, applyEquipmentChoice } from '@/lib/exerciseEquipment';
import { mergeTags, cleanExtraPatch } from '@/lib/exerciseTags';

export const dynamic = 'force-dynamic';

async function checkExerciseOwnership(exerciseId: string, adminId: string | null) {
    if (!adminId) return false;
    if (MASTER_IDS.includes(adminId)) return true;
    const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { coachId: true } });
    if (!exercise) return false;
    return exercise.coachId === adminId;
}

// 👇 Espelha automaticamente um exercício novo do Paulo para a Adri
// Cria uma cópia independente (coachId = Adri) — ela pode trocar vídeo,
// editar ou até apagar a cópia dela sem afetar o exercício original do Paulo.
// Só roda quando quem criou é o Paulo (fonte única da biblioteca base).
async function mirrorExerciseForAdri(data: {
  name: string;
  category: string;
  subCategory: string;
  environments: string[];
  tags: object;
  videoUrl: string;
  instructions: string;
  howToExecute: string | null;
  commonMistakes: string | null;
  maleFocus: string | null;
  femaleFocus: string | null;
  defaultSubstitutes: string[];
}) {
  try {
    // Traduz os IDs de substitutos (que apontam pra exercícios do Paulo)
    // para os IDs equivalentes da Adri, casando por nome.
    let translatedSubstitutes: string[] = [];
    if (data.defaultSubstitutes && data.defaultSubstitutes.length > 0) {
      const masterSubs = await prisma.exercise.findMany({
        where: { id: { in: data.defaultSubstitutes } },
        select: { id: true, name: true }
      });
      const adriMatches = await prisma.exercise.findMany({
        where: { coachId: ADRI_ID },
        select: { id: true, name: true }
      });
      const adriByName = new Map(adriMatches.map(a => [a.name.toLowerCase().trim(), a.id]));
      translatedSubstitutes = masterSubs
        .map(s => adriByName.get(s.name.toLowerCase().trim()))
        .filter((id): id is string => Boolean(id));
    }

    await prisma.exercise.create({
      data: {
        name: data.name,
        category: data.category,
        subCategory: data.subCategory,
        environments: data.environments,
        tags: data.tags,
        videoUrl: data.videoUrl,
        instructions: data.instructions,
        howToExecute: data.howToExecute,
        commonMistakes: data.commonMistakes,
        maleFocus: data.maleFocus,
        femaleFocus: data.femaleFocus,
        coachId: ADRI_ID,
        defaultSubstitutes: translatedSubstitutes
      }
    });
  } catch (error: any) {
    // Se a Adri já tem um exercício com esse nome (P2002), não é erro —
    // só significa que ela já tem a própria versão dele.
    if (error.code !== 'P2002') {
      console.error('Erro ao espelhar exercício para Adri:', error);
    }
  }
}

function guessSubCategory(name: string, category: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (c.includes('peit')) {
    if (n.includes('inclinado') || n.includes('superior')) return 'Superior';
    if (n.includes('declinado') || n.includes('inferior')) return 'Inferior';
    return 'Medial';
  }
  if (c.includes('costas') || c.includes('dorsal')) {
    if (n.includes('puxada') || n.includes('pulldown') || n.includes('barra fixa') || n.includes('pull down')) return 'Puxadas';
    if (n.includes('lombar') || n.includes('hiperextensão') || n.includes('bom dia')) return 'Lombar';
    return 'Remadas';
  }
  if (c.includes('perna') || c.includes('membros inferiores') || c.includes('coxa')) {
    if (n.includes('panturrilha') || n.includes('gêmeos') || n.includes('gemeos') || n.includes('sóleo')) return 'Panturrilha';
    if (n.includes('glúteo') || n.includes('gluteo') || n.includes('pélvica') || n.includes('pelvica') || n.includes('abdutora') || n.includes('coice')) return 'Glúteos';
    if (n.includes('flexora') || n.includes('stiff') || n.includes('posterior') || n.includes('romeno')) return 'Posteriores';
    if (n.includes('extensora') || n.includes('adutora') || n.includes('adutor') || n.includes('sissy')) return 'Quadríceps e Adutores';
    if (n.includes('agachamento') || n.includes('leg') || n.includes('hack') || n.includes('afundo') || n.includes('passada') || n.includes('búlgaro')) return 'Multiarticular';
    return 'Geral';
  }
  if (c.includes('ombro') || c.includes('deltoide')) {
    if (n.includes('encolhimento') || n.includes('trapézio') || n.includes('trapezio')) return 'Trapézio';
    if (n.includes('desenvolvimento')) return 'Multiarticular';
    if (n.includes('frontal') || n.includes('frente')) return 'Frontal';
    if (n.includes('posterior') || n.includes('inverso') || n.includes('face pull') || n.includes('facepull') || n.includes('voador inverso')) return 'Posterior';
    if (n.includes('lateral') || n.includes('manguito') || n.includes('remada alta')) return 'Lateral';
    return 'Geral';
  }
  if (c.includes('abd') || c.includes('core')) {
    if (n.includes('remador') || n.includes('rodinha') || n.includes('roda') || n.includes('canivete') || n.includes('completo')) return 'Completo';
    if (n.includes('infra') || n.includes('perna') || n.includes('pendurado')) return 'Infra';
    if (n.includes('prancha') || n.includes('isometria') || n.includes('oblíquo') || n.includes('obliquo')) return 'Core';
    return 'Supra';
  }
  return 'Geral';
}

function generateTags(name: string, category: string): object {
  const n = name.toLowerCase();
  let target = category.toUpperCase();
  if (n.includes('stiff') || n.includes('flexora') || n.includes('posterior') || n.includes('romeno')) target = 'POSTERIOR';
  else if (n.includes('extensora') || n.includes('agachamento') || n.includes('leg press') || n.includes('hack') || n.includes('sissy')) target = 'QUADRICEPS';
  else if (n.includes('pelve') || n.includes('pélvica') || n.includes('abdução') || n.includes('glúteo') || n.includes('gluteo') || n.includes('coice') || n.includes('abdutora')) target = 'GLUTEOS';
  else if (n.includes('adutora') || n.includes('adutor')) target = 'ADUTOR';
  else if (n.includes('panturrilha') || n.includes('gêmeos') || n.includes('gemeos') || n.includes('sóleo')) target = 'PANTURRILHA';
  else if (n.includes('supino') || n.includes('crucifixo') || n.includes('peck deck') || n.includes('voador frontal') || n.includes('cross')) target = 'PEITO';
  else if (n.includes('remada') || n.includes('serrote')) target = 'COSTAS_REMADA';
  else if (n.includes('puxada') || n.includes('pulldown') || n.includes('pull down') || n.includes('barra fixa')) target = 'COSTAS_PUXADA';
  else if (n.includes('desenvolvimento') || n.includes('elevação frontal') || n.includes('frontal')) target = 'OMBRO_FRONTAL';
  else if (n.includes('elevação lateral') || n.includes('lateral')) target = 'OMBRO_LATERAL';
  else if (n.includes('voador inverso') || n.includes('face pull') || n.includes('posterior')) target = 'OMBRO_POST';
  else if (n.includes('encolhimento') || n.includes('trapézio') || n.includes('trapezio')) target = 'TRAPEZIO';
  else if (n.includes('tríceps') || n.includes('triceps') || n.includes('francesa') || n.includes('testa') || n.includes('corda')) target = 'TRICEPS';
  else if (n.includes('bíceps') || n.includes('biceps') || n.includes('rosca') || n.includes('scott')) target = 'BICEPS';
  else if (n.includes('abdominal') || n.includes('prancha') || n.includes('infra') || n.includes('oblíquo')) target = 'ABDOMEN';

  let mechanic = 'ISOLADO';
  if (n.includes('agachamento') || n.includes('leg press') || n.includes('supino') || n.includes('remada') || n.includes('puxada') || n.includes('desenvolvimento') || n.includes('stiff') || n.includes('terra') || n.includes('hack') || n.includes('afundo') || n.includes('passada') || n.includes('búlgaro') || n.includes('mergulho') || n.includes('barra fixa')) mechanic = 'COMPOSTO';

  // 🏋️ equipamento: regra única em lib/exerciseEquipment.ts (Smith separado da barra); sem palpite fica LIVRE ("sem classificar")
  const equipment: string = guessEquipment(name, category)?.equipment || 'LIVRE';

  const jointRisk: string[] = [];
  if (n.includes('stiff') || n.includes('terra') || n.includes('remada curvada') || n.includes('agachamento livre') || n.includes('bom dia')) jointRisk.push('LOMBAR');
  if (n.includes('agachamento') || n.includes('extensora') || n.includes('leg press') || n.includes('hack') || n.includes('sissy') || n.includes('afundo') || n.includes('passada')) jointRisk.push('JOELHO');
  if (n.includes('desenvolvimento') || n.includes('tríceps testa') || n.includes('puxada costas') || n.includes('crucifixo') || n.includes('supino')) jointRisk.push('OMBRO');

  return { target, mechanic, equipment, jointRisk };
}

// 👇 LISTAGEM — sem duplicatas
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    if (!adminId || adminId === 'null' || adminId === 'undefined') {
      return NextResponse.json([]);
    }

    // 🔒 Só o próprio coach pode listar a própria biblioteca (ou o time master).
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // 🔥 Master vê APENAS os próprios exercícios + globais (sem coachId); não mistura com os de outros admins do MASTER_IDS — evita duplicatas.
    // Parceiro vê os próprios + herda APENAS do Paulo (master principal) e dos globais — menos os que o Paulo marcou "só o Paulo vê".
    const whereClause = visibleLibraryWhere(adminId);

    const exercises = await prisma.exercise.findMany({
      where: whereClause,
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(exercises);
  } catch (error) {
    console.error("Erro GET Exercises:", error);
    return NextResponse.json({ error: "Erro ao buscar exercícios" }, { status: 500 });
  }
}

// 👇 CRIAÇÃO
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cat = body.muscleGroup || body.category || "Geral";
    const subCat = body.subCategory || guessSubCategory(body.name, cat);
    const envs = body.environments && body.environments.length > 0 ? body.environments : ["ACADEMIA"];
    // 🏷️ (19 out 2026) tags novas (impacto, evitar para, favorito) vêm de `body.extraTags`; as automáticas (músculo, equipamento...) seguem pelo nome
    const generated = generateTags(body.name, cat);
    // 🏋️ equipamento escolhido no formulário (7 opções) trava; "AUTO"/ausente = palpite pelo nome
    const tags = applyEquipmentChoice(mergeTags(generated, null, cleanExtraPatch(body.extraTags)) as any, body.equipment, (generated as any).equipment);
    const adminId = body.adminId;

    if (!adminId) return NextResponse.json({ error: "Acesso Negado: Faltando Admin ID" }, { status: 403 });

    // 🔒 Só o próprio coach pode criar na própria biblioteca (ou o time master).
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const exerciseData = {
      name: body.name,
      category: cat,
      subCategory: subCat,
      environments: envs,
      tags: tags,
      videoUrl: body.videoUrl || "",
      instructions: body.instructions || "Execução padrão FIT OS.",
      howToExecute: body.howToExecute || null,
      commonMistakes: body.commonMistakes || null,
      maleFocus: body.maleFocus || null,
      femaleFocus: body.femaleFocus || null,
      defaultSubstitutes: body.defaultSubstitutes || []
    };

    // 🙈 Só o time master pode marcar "só o Paulo vê"; de qualquer outro coach o campo é ignorado.
    const hidden = hiddenFlagFromBody(body, adminId);

    const exercise = await prisma.exercise.create({
      data: {
        ...exerciseData,
        ...(hidden === undefined ? {} : { hiddenFromCoaches: hidden }),
        coachId: adminId
      }
    });

    // 🔥 Herança automática: exercício novo criado pelo Paulo é espelhado
    // pra Adri na hora — ela já vê ele no admin dela, mas numa cópia
    // independente (pode trocar vídeo/editar sem afetar o original do Paulo).
    if (adminId === PAULO_ID) {
      await mirrorExerciseForAdri(exerciseData);
    }

    return NextResponse.json(exercise);
  } catch (error: any) {
    console.error("Erro POST Exercise:", error);
    if (error.code === 'P2002') return NextResponse.json({ error: "Já cadastrado." }, { status: 400 });
    return NextResponse.json({ error: "Erro ao cadastrar" }, { status: 500 });
  }
}

// 👇 EDIÇÃO
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, adminId } = body;

    // 🔒 Confirma que quem chamou é realmente esse coach (ou master) antes
    // de checar se ele é o dono do exercício — adminId vem do corpo e não
    // pode ser confiado sem verificar contra o token.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const isOwner = await checkExerciseOwnership(id, adminId);
    if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Apenas o criador pode editar este exercício." }, { status: 403 });

    const cat = body.muscleGroup || body.category || "Geral";
    const subCat = body.subCategory || guessSubCategory(body.name, cat);
    const envs = body.environments && body.environments.length > 0 ? body.environments : ["ACADEMIA"];
    // 🏷️ (19 out 2026) editar o exercício REGERA as tags automáticas pelo nome, mas NÃO pode apagar as marcações novas feitas à mão (impacto, evitar para, favorito)
    const current = await prisma.exercise.findUnique({ where: { id }, select: { tags: true } });
    const generated = generateTags(body.name, cat);
    // 🏋️ equipamento: sem o campo no corpo mantém o que já tem (travado à mão fica); "AUTO" destrava e volta ao palpite; um dos 7 trava
    const tags = applyEquipmentChoice(mergeTags(generated, current?.tags, cleanExtraPatch(body.extraTags)) as any, body.equipment, (generated as any).equipment);
    // 🙈 Só o time master muda "só o Paulo vê"; sem o campo no corpo, o valor atual é mantido.
    const hidden = hiddenFlagFromBody(body, adminId);

    const updatedExercise = await prisma.exercise.update({
      where: { id: id },
      data: {
        name: body.name,
        category: cat,
        subCategory: subCat,
        environments: envs,
        tags: tags,
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS.",
        howToExecute: body.howToExecute || null,
        commonMistakes: body.commonMistakes || null,
        maleFocus: body.maleFocus || null,
        femaleFocus: body.femaleFocus || null,
        defaultSubstitutes: body.defaultSubstitutes || [],
        ...(hidden === undefined ? {} : { hiddenFromCoaches: hidden })
      }
    });
    return NextResponse.json(updatedExercise);
  } catch (error) {
    console.error("Erro PUT Exercise:", error);
    return NextResponse.json({ error: "Erro ao editar" }, { status: 500 });
  }
}

// 👇 EXCLUSÃO
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const adminId = searchParams.get('adminId');

    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    // 🔒 Confirma que quem chamou é realmente esse coach (ou master) antes
    // de checar se ele é o dono do exercício.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const isOwner = await checkExerciseOwnership(id, adminId);
    if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Apenas o criador pode excluir este exercício." }, { status: 403 });

    await prisma.exercise.delete({ where: { id: id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    // 🔁 (20 out 2026) P2003 = o exercício está na ficha de algum aluno. Antes saía só "Erro ao excluir"; agora o app sabe que dá para TROCAR por outro e apagar (GET/POST /api/exercise/replace).
    if (error?.code === 'P2003') return NextResponse.json({ error: 'Este exercício está em treinos de alunos. Escolha outro exercício para substituir e depois apague.', inUse: true }, { status: 409 });
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { getAuthUser } from '@/lib/auth';


// 🔥 FUNÇÃO DE MURALHA: Verifica se o Coach é dono deste Aluno
async function checkUserOwnership(userId: string, adminId: string | null) {
    if (!adminId) return false; 
    if (MASTER_IDS.includes(adminId)) return true; // Master tem passe livre
    
    const targetUser = await prisma.user.findUnique({ 
        where: { id: userId }, 
        select: { coachId: true, nutritionistId: true } 
    });
    
    if (!targetUser) return false;
    return targetUser.coachId === adminId || targetUser.nutritionistId === adminId;
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, phone, password, adminId } = body; // 🔥 adminId adicionado

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário obrigatório" }, { status: 400 });
    }

    // 🔐 Se a chamada veio com um token válido (app atualizado), ele manda —
    // nunca confiamos no `adminId` do corpo quando há token, porque esse
    // campo é forjável por qualquer cliente. Enquanto o app antigo (sem
    // token) ainda estiver em uso, caímos de volta pro `adminId` do corpo
    // (comportamento antigo) só pra não quebrar quem ainda não atualizou.
    const authUser = getAuthUser(req);
    const callerId = authUser?.id ?? adminId ?? null;

    // 🔥 BLOQUEIO DE SEGURANÇA NA ATUALIZAÇÃO — só verifica ownership quando
    // o chamador não é o próprio dono do perfil sendo editado.
    if (callerId && callerId !== userId) {
        const isOwner = await checkUserOwnership(userId, callerId);
        if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Você não pode alterar os dados deste aluno." }, { status: 403 });
    }

    // Prepara o objeto de atualização
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    // 🔒 Senha SEMPRE em hash — antes ia em texto puro pro banco.
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ success: true, user: updatedUser });

  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    return NextResponse.json({ error: "Erro ao atualizar dados." }, { status: 500 });
  }
}
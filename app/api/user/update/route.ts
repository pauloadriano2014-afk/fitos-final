import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';


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

    // 🔥 BLOQUEIO DE SEGURANÇA NA ATUALIZAÇÃO (Se for um Admin/Coach tentando editar)
    if (adminId) {
        const isOwner = await checkUserOwnership(userId, adminId);
        if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Você não pode alterar os dados deste aluno." }, { status: 403 });
    }

    // Prepara o objeto de atualização
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    // Se quiser permitir troca de senha simples (sem hash por enquanto, ou adicione bcrypt aqui se já usar)
    if (password) updateData.password = password;

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
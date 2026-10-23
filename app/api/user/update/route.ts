import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { getAuthUser } from '@/lib/auth';
import { validPhotoUrl } from '@/lib/photoUrl';


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
    const { userId, name, phone, password, adminId, photoUrl } = body; // 🔥 adminId adicionado

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

    // 📷 (23 out 2026) Foto de perfil: o app sobe a imagem para o R2 (/api/upload-image) e manda só o LINK. Só com login (token) e só link do nosso R2;
    // null ou vazio apaga a foto. Antes a foto ficava só no aparelho (base64) e nem o coach nem outro aparelho do aluno via.
    let photoChange: { set: boolean; value: string | null } = { set: false, value: null };
    if (photoUrl !== undefined) {
        if (!authUser) return NextResponse.json({ error: "Faça login de novo para trocar a foto." }, { status: 401 });
        const checked = validPhotoUrl(photoUrl);
        if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
        photoChange = { set: true, value: checked.value };
    }

    // Prepara o objeto de atualização
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    // 🔒 Senha SEMPRE em hash — antes ia em texto puro pro banco.
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (photoChange.set) updateData.photoUrl = photoChange.value;

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
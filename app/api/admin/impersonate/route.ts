// app/api/admin/impersonate/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const coachId = searchParams.get('coachId');

        if (!coachId) {
            return NextResponse.json({ error: 'ID do Coach é obrigatório.' }, { status: 400 });
        }

        // 1. Verifica se o Coach realmente existe
        const coach = await prisma.user.findUnique({
            where: { id: coachId }
        });

        if (!coach) {
            return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });
        }

        // 2. Busca se já existe um Aluno Teste para este Coach
        let testStudent = await prisma.user.findFirst({
            where: {
                coachId: coachId,
                isTestAccount: true,
                role: 'USER'
            }
        });

        // 3. Se não existir, cria o Aluno Fantasma na hora
        if (!testStudent) {
            const coachFirstName = (coach.name || 'Coach').split(' ')[0];
            
            testStudent = await prisma.user.create({
                data: {
                    email: `teste.${coachId.substring(0, 6)}@performos.com`,
                    password: "senha_teste_bloqueada_123", // Senha fake. Como o login é via token direto, ninguém entra com ela.
                    name: `Aluno Teste (${coachFirstName})`,
                    role: 'USER',
                    isTestAccount: true,
                    coachId: coachId,
                    plan: 'ELITE', // Para que o coach teste todas as funções premium no app
                    active: true,
                    gender: 'Masculino',
                    birthDate: '1990-01-01',
                    dietModule: true,
                }
            });
        }

        // 4. Retorna os dados do aluno fantasma (omitindo a senha por segurança)
        const { password, ...safeStudentData } = testStudent;

        return NextResponse.json(safeStudentData, { status: 200 });

    } catch (error: any) {
        console.error('[Impersonate API] Erro interno:', error);
        return NextResponse.json({ error: 'Erro ao gerar o aluno teste.' }, { status: 500 });
    }
}
// app/api/admin/produtos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
    try {
        const produtos = await prisma.produtoDigital.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { vendas: true }
                }
            }
        });
        return NextResponse.json({ produtos });
    } catch (error) {
        console.error('[admin/produtos][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar produtos' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { 
            nome, slug, descricao, capaUrl, valor, coachId, linkEntrega, 
            orderBumpTitulo, orderBumpTexto, orderBumpValor, ativo 
        } = body;

        if (!nome || !slug || !valor || !coachId) {
            return NextResponse.json({ error: 'Nome, slug, valor e dono do produto são obrigatórios.' }, { status: 400 });
        }

        const produto = await prisma.produtoDigital.create({
            data: {
                nome, 
                slug, 
                descricao, 
                capaUrl, 
                valor: Number(valor), 
                coachId, 
                linkEntrega,
                orderBumpTitulo, 
                orderBumpTexto, 
                orderBumpValor: orderBumpValor ? Number(orderBumpValor) : null,
                ativo: ativo ?? true
            }
        });

        return NextResponse.json({ produto }, { status: 201 });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Já existe um produto usando este link (slug).' }, { status: 400 });
        }
        console.error('[admin/produtos][POST]', error);
        return NextResponse.json({ error: 'Erro ao criar produto' }, { status: 500 });
    }
}
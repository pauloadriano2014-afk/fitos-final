import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        // 🔥 INCLUA O coachPhotoUrl AQUI:
        const { coachId, pageTitle, aboutText, videoUrl, themeColor, appFeatures, galleryPhotos, coachPhotoUrl } = body;
        
        if (!coachId) return NextResponse.json({ error: "coachId obrigatório" }, { status: 400 });

        const updatedConfig = await prisma.salesPageConfig.upsert({
            where: { coachId },
            update: { 
                pageTitle, 
                aboutText, 
                videoUrl,
                coachPhotoUrl, // 🔥 ATUALIZA AQUI
                themeColor,
                appFeatures: appFeatures || [],
                galleryPhotos: galleryPhotos || []
            },
            create: { 
                coachId, 
                pageTitle, 
                aboutText, 
                videoUrl,
                coachPhotoUrl, // 🔥 CRIA AQUI
                themeColor,
                appFeatures: appFeatures || [],
                galleryPhotos: galleryPhotos || []
            }
        });

        return NextResponse.json({ success: true, config: updatedConfig });
    } catch (error) {
        console.error("Erro ao salvar página de vendas:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            coachId, pageTitle, aboutText, videoUrl, themeColor, 
            appFeatures, galleryPhotos, coachPhotoUrl,
            galleryTexts, testimonialNames, testimonialTexts // 🔥 NOVOS
        } = body;
        
        if (!coachId) return NextResponse.json({ error: "coachId obrigatório" }, { status: 400 });

        const updatedConfig = await prisma.salesPageConfig.upsert({
            where: { coachId },
            update: { 
                pageTitle, aboutText, videoUrl, coachPhotoUrl, themeColor,
                appFeatures: appFeatures || [],
                galleryPhotos: galleryPhotos || [],
                galleryTexts: galleryTexts || [],
                testimonialNames: testimonialNames || [],
                testimonialTexts: testimonialTexts || []
            },
            create: { 
                coachId, pageTitle, aboutText, videoUrl, coachPhotoUrl, themeColor,
                appFeatures: appFeatures || [],
                galleryPhotos: galleryPhotos || [],
                galleryTexts: galleryTexts || [],
                testimonialNames: testimonialNames || [],
                testimonialTexts: testimonialTexts || []
            }
        });

        return NextResponse.json({ success: true, config: updatedConfig });
    } catch (error) {
        console.error("Erro ao salvar página de vendas:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
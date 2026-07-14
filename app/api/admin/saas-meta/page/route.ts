import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        // 🔥 INCLUA pixKey e pixName AQUI:
        const { 
            coachId, pageTitle, aboutText, videoUrl, coachPhotoUrl, themeColor, 
            appFeatures, galleryPhotos, galleryTexts, testimonialNames, testimonialTexts,
            pixKey, pixName 
        } = body;
        
        if (!coachId) return NextResponse.json({ error: "coachId obrigatório" }, { status: 400 });

        const updatedConfig = await prisma.salesPageConfig.upsert({
            where: { coachId },
            update: { 
                pageTitle, aboutText, videoUrl, coachPhotoUrl, themeColor, pixKey, pixName,
                appFeatures: appFeatures || [], galleryPhotos: galleryPhotos || [],
                galleryTexts: galleryTexts || [], testimonialNames: testimonialNames || [],
                testimonialTexts: testimonialTexts || []
            },
            create: { 
                coachId, pageTitle, aboutText, videoUrl, coachPhotoUrl, themeColor, pixKey, pixName,
                appFeatures: appFeatures || [], galleryPhotos: galleryPhotos || [],
                galleryTexts: galleryTexts || [], testimonialNames: testimonialNames || [],
                testimonialTexts: testimonialTexts || []
            }
        });

        return NextResponse.json({ success: true, config: updatedConfig });
    } catch (error) { return NextResponse.json({ error: "Erro interno" }, { status: 500 }); }
}
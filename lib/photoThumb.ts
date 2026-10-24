// lib/photoThumb.ts
// 📷 (25 out 2026) Miniatura das fotos de check-in/avaliação. Foto de celular em pé costuma vir "deitada" com um aviso de rotação (EXIF orientation) dentro do arquivo: o navegador lê o aviso e mostra
// em pé, mas o `sharp` ignorava o aviso e a miniatura saía DEITADA (reportado pelo Paulo: "o aluno manda em retrato ou 9:16 e a foto aparece de lado"). `.rotate()` sem número = gira
// conforme o aviso e já remove o aviso, então a miniatura sai em pé e certa em qualquer lugar.
import sharp from 'sharp';

export async function makeThumbnail(buffer: Buffer, width = 300, quality = 60): Promise<Buffer> {
    return sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
}

// prisma/seed-foods.ts — VERSÃO COMPLETA
// Importa: CUSTOM (seu catálogo, MASTER_TEAM) + TACO completa (589 alimentos, global)
// isFavorite: true = aparece nos "Favoritos" do modal
// Execução: npx ts-node prisma/seed-foods.ts

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const MASTER_TEAM = 'MASTER_TEAM';

// ─── CATÁLOGO CUSTOMIZADO (seu catálogo atual, MASTER_TEAM) ───────────────────
const CUSTOM_FOODS = [
  { name:'Queijo Cottage Tradicional',       cat:'Frios e Laticínios',    sub:'Queijos e Pastas',      unit:'g',  kcal:98,  p:11, c:3,  f:4,  lactose:false, conv:0.11 },
  { name:'Queijo Cottage Zero Lactose',      cat:'Frios e Laticínios',    sub:'Queijos e Pastas',      unit:'g',  kcal:95,  p:11, c:2,  f:4,  lactose:true,  conv:0.11 },
  { name:'Presunto Magro',                   cat:'Frios e Laticínios',    sub:'Frios e Embutidos',     unit:'g',  kcal:105, p:16, c:2,  f:3,  lactose:false, conv:0.14 },
  { name:'Peito de Peru (Fatiado)',          cat:'Frios e Laticínios',    sub:'Frios e Embutidos',     unit:'g',  kcal:110, p:21, c:1,  f:2,  lactose:false, conv:0.21 },
  { name:'Peito de Frango Fatiado',          cat:'Frios e Laticínios',    sub:'Frios e Embutidos',     unit:'g',  kcal:110, p:21, c:1,  f:2,  lactose:false, conv:0.19 },
  { name:'Queijo Mussarela Light',           cat:'Frios e Laticínios',    sub:'Queijos e Pastas',      unit:'g',  kcal:260, p:24, c:2,  f:16, lactose:false, conv:0.24 },
  { name:'Queijo Minas Frescal Light',       cat:'Frios e Laticínios',    sub:'Queijos e Pastas',      unit:'g',  kcal:160, p:16, c:3,  f:9,  lactose:false, conv:0.16 },
  { name:'Queijo Ricota Fresca',             cat:'Frios e Laticínios',    sub:'Queijos e Pastas',      unit:'g',  kcal:140, p:11, c:3,  f:8,  lactose:false, conv:0.11 },
  { name:'Requeijão Light',                  cat:'Frios e Laticínios',    sub:'Queijos e Pastas',      unit:'g',  kcal:180, p:10, c:2,  f:14, lactose:false, conv:0.08 },
  { name:'Cream Cheese Light',               cat:'Frios e Laticínios',    sub:'Queijos e Pastas',      unit:'g',  kcal:200, p:8,  c:3,  f:16, lactose:false, conv:0.07 },
  { name:'Iogurte Natural Desnatado',        cat:'Frios e Laticínios',    sub:'Leites e Iogurtes',     unit:'g',  kcal:40,  p:4,  c:5,  f:0,  lactose:false, conv:0.04 },
  { name:'Iogurte Grego Zero/Light',         cat:'Frios e Laticínios',    sub:'Leites e Iogurtes',     unit:'g',  kcal:50,  p:6,  c:5,  f:0,  lactose:false, conv:0.07 },
  { name:'Iogurte Grego Tradicional',        cat:'Frios e Laticínios',    sub:'Leites e Iogurtes',     unit:'g',  kcal:90,  p:4,  c:5,  f:6,  lactose:false, conv:0.05 },
  { name:'Leite Desnatado',                  cat:'Frios e Laticínios',    sub:'Leites e Iogurtes',     unit:'ml', kcal:35,  p:3,  c:5,  f:0,  lactose:false, conv:0.03 },
  { name:'Leite Integral',                   cat:'Frios e Laticínios',    sub:'Leites e Iogurtes',     unit:'ml', kcal:60,  p:3,  c:5,  f:3,  lactose:false, conv:0.03 },
  { name:'Leite Zero Lactose',               cat:'Frios e Laticínios',    sub:'Leites e Iogurtes',     unit:'ml', kcal:60,  p:3,  c:5,  f:3,  lactose:true,  conv:0.03 },
  { name:'Frango Grelhado',                  cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:165, p:31, c:0,  f:3,  lactose:false, conv:0.30 },
  { name:'Frango Desfiado (Cozido)',         cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:165, p:31, c:0,  f:3,  lactose:true,  conv:0.30 },
  { name:'Sobrecoxa de Frango (Sem pele)',   cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:210, p:28, c:0,  f:10, lactose:true,  conv:0.28 },
  { name:'Moela de Frango (Cozida)',         cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:153, p:30, c:0,  f:3,  lactose:true,  conv:0.30 },
  { name:'Patinho (Cozido / Iscas)',         cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:219, p:35, c:0,  f:7,  lactose:true,  conv:0.32 },
  { name:'Carne Moída (Patinho)',            cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:219, p:35, c:0,  f:7,  lactose:false, conv:0.27 },
  { name:'Alcatra Grelhada',                 cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:240, p:31, c:0,  f:11, lactose:true,  conv:0.32 },
  { name:'Filé Mignon Grelhado',             cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:260, p:32, c:0,  f:13, lactose:true,  conv:0.30 },
  { name:'Carne de Panela (Cozida)',         cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:220, p:30, c:0,  f:10, lactose:true,  conv:0.30 },
  { name:'Carne Seca / Charque (Desfiada)', cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:280, p:40, c:0,  f:12, lactose:true,  conv:0.40 },
  { name:'Peito de Peru Grelhado',           cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:150, p:29, c:0,  f:3,  lactose:true,  conv:0.29 },
  { name:'Tilápia Grelhada',                 cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:128, p:26, c:0,  f:2,  lactose:false, conv:0.23 },
  { name:'Salmão Grelhado',                  cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:200, p:25, c:0,  f:10, lactose:true,  conv:0.25 },
  { name:'Pescada Branca Grelhada',          cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:110, p:26, c:0,  f:1,  lactose:true,  conv:0.26 },
  { name:'Atum (Grelhado ou Assado)',        cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:130, p:29, c:0,  f:1,  lactose:true,  conv:0.29 },
  { name:'Sardinha (Enlatada em Água)',      cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:110, p:24, c:0,  f:2,  lactose:true,  conv:0.24 },
  { name:'Camarão Grelhado',                 cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:100, p:24, c:0,  f:1,  lactose:true,  conv:0.24 },
  { name:'Ovos Inteiros',                    cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'un', kcal:143, p:13, c:1,  f:10, lactose:false, conv:6.00 },
  { name:'Clara de Ovo',                     cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'un', kcal:52,  p:11, c:1,  f:0,  lactose:false, conv:3.00 },
  { name:'Tofu (Queijo de Soja)',            cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:76,  p:8,  c:2,  f:4,  lactose:true,  conv:0.08 },
  { name:'Proteína de Soja (PTS Crua)',      cat:'Carnes e Proteínas',    sub:'Proteínas Gerais',      unit:'g',  kcal:320, p:50, c:30, f:1,  lactose:true,  conv:0.50 },
  { name:'Arroz Branco',                     cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:130, p:2,  c:28, f:0,  conv:0.28 },
  { name:'Arroz Integral',                   cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:111, p:2,  c:23, f:1,  conv:0.28 },
  { name:'Batata Inglesa Cozida',            cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:86,  p:1,  c:19, f:0,  conv:0.18 },
  { name:'Batata Doce Cozida',              cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:86,  p:1,  c:20, f:0,  conv:0.20 },
  { name:'Mandioca Cozida',                 cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:114, p:1,  c:26, f:0,  conv:0.30 },
  { name:'Mandioquinha / Batata Baroa',     cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:100, p:1,  c:20, f:0,  conv:0.20 },
  { name:'Inhame (Cozido)',                 cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:118, p:1,  c:28, f:0,  conv:0.28 },
  { name:'Macarrão Cozido',                cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:130, p:4,  c:28, f:0,  conv:0.30 },
  { name:'Macarrão Integral (Cozido)',     cat:'Carboidratos',          sub:'Carbos Base',           unit:'g',  kcal:124, p:5,  c:26, f:1,  conv:0.28 },
  { name:'Pão de Forma Tradicional',       cat:'Carboidratos',          sub:'Pães e Massas',         unit:'g',  kcal:260, p:8,  c:50, f:2,  conv:0.50 },
  { name:'Pão Francês',                    cat:'Carboidratos',          sub:'Pães e Massas',         unit:'g',  kcal:300, p:9,  c:58, f:3,  conv:0.50 },
  { name:'Pão Integral',                   cat:'Carboidratos',          sub:'Pães e Massas',         unit:'g',  kcal:250, p:10, c:46, f:3,  conv:0.45 },
  { name:'Tapioca (Goma)',                 cat:'Carboidratos',          sub:'Pães e Massas',         unit:'g',  kcal:330, p:0,  c:81, f:0,  conv:0.60 },
  { name:'Rap10',                          cat:'Carboidratos',          sub:'Pães e Massas',         unit:'g',  kcal:300, p:8,  c:52, f:5,  conv:0.50 },
  { name:'Massa de Crepioca',              cat:'Carboidratos',          sub:'Pães e Massas',         unit:'g',  kcal:330, p:0,  c:81, f:0,  conv:1.00 },
  { name:'Aveia em Flocos',               cat:'Carboidratos',          sub:'Cereais e Fibras',      unit:'g',  kcal:380, p:13, c:60, f:8,  conv:0.60 },
  { name:'Cuscuz de Milho',               cat:'Carboidratos',          sub:'Cereais e Fibras',      unit:'g',  kcal:112, p:3,  c:25, f:0,  conv:0.25 },
  { name:'Chia',                           cat:'Carboidratos',          sub:'Cereais e Fibras',      unit:'g',  kcal:486, p:16, c:40, f:30, conv:0.40 },
  { name:'Farinha de Linhaça',            cat:'Carboidratos',          sub:'Cereais e Fibras',      unit:'g',  kcal:534, p:18, c:30, f:42, conv:0.30 },
  { name:'Granola Sem Açúcar',            cat:'Carboidratos',          sub:'Cereais e Fibras',      unit:'g',  kcal:380, p:10, c:60, f:10, conv:0.60 },
  { name:'Feijão Carioca Cozido',         cat:'Carboidratos',          sub:'Leguminosas e Grãos',   unit:'g',  kcal:76,  p:4,  c:13, f:0,  conv:0.20 },
  { name:'Feijão Preto Cozido',           cat:'Carboidratos',          sub:'Leguminosas e Grãos',   unit:'g',  kcal:91,  p:5,  c:14, f:0,  conv:0.20 },
  { name:'Lentilha Cozida',               cat:'Carboidratos',          sub:'Leguminosas e Grãos',   unit:'g',  kcal:116, p:9,  c:20, f:0,  conv:0.20 },
  { name:'Grão de Bico Cozido',           cat:'Carboidratos',          sub:'Leguminosas e Grãos',   unit:'g',  kcal:164, p:8,  c:27, f:2,  conv:1.00 },
  { name:'Paçoca (Rolha)',                cat:'Carboidratos',          sub:'Doces e Açúcares',      unit:'g',  kcal:490, p:15, c:60, f:25, conv:0.60 },
  { name:'Chocolate Meio Amargo (70%)',   cat:'Carboidratos',          sub:'Doces e Açúcares',      unit:'g',  kcal:540, p:6,  c:45, f:35, conv:0.45 },
  { name:'Geleia de Frutas (100% Fruta)', cat:'Carboidratos',          sub:'Doces e Açúcares',      unit:'g',  kcal:150, p:0,  c:10, f:0,  conv:0.10 },
  { name:'Banana',                        cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:89,  p:1,  c:23, f:0,  conv:0.23 },
  { name:'Maçã',                          cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:52,  p:0,  c:14, f:0,  conv:0.15 },
  { name:'Mamão',                         cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:43,  p:0,  c:11, f:0,  conv:0.11 },
  { name:'Morango',                       cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:32,  p:1,  c:8,  f:0,  conv:0.08 },
  { name:'Laranja',                       cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:47,  p:1,  c:12, f:0,  conv:0.12 },
  { name:'Melancia',                      cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:30,  p:1,  c:8,  f:0,  conv:0.08 },
  { name:'Melão',                         cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:34,  p:1,  c:8,  f:0,  conv:0.08 },
  { name:'Abacaxi',                       cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:50,  p:1,  c:13, f:0,  conv:0.13 },
  { name:'Uva',                           cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:69,  p:1,  c:17, f:0,  conv:0.16 },
  { name:'Kiwi',                          cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:61,  p:1,  c:15, f:0,  conv:0.15 },
  { name:'Pera',                          cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:57,  p:0,  c:15, f:0,  conv:0.15 },
  { name:'Tangerina',                     cat:'Frutas',                sub:'Frutas',                unit:'g',  kcal:53,  p:1,  c:13, f:0,  conv:0.12 },
  { name:'Azeite de Oliva',              cat:'Gorduras e Oleaginosas', sub:'Gorduras e Oleaginosas', unit:'ml', kcal:884, p:0,  c:0,  f:100,conv:1.00 },
  { name:'Pasta de Amendoim',            cat:'Gorduras e Oleaginosas', sub:'Gorduras e Oleaginosas', unit:'g',  kcal:588, p:25, c:20, f:50, conv:0.50 },
  { name:'Castanha do Pará',             cat:'Gorduras e Oleaginosas', sub:'Gorduras e Oleaginosas', unit:'g',  kcal:650, p:14, c:12, f:66, conv:0.60 },
  { name:'Nozes',                        cat:'Gorduras e Oleaginosas', sub:'Gorduras e Oleaginosas', unit:'g',  kcal:650, p:15, c:14, f:65, conv:0.60 },
  { name:'Manteiga',                     cat:'Gorduras e Oleaginosas', sub:'Gorduras e Oleaginosas', unit:'g',  kcal:717, p:1,  c:1,  f:81, conv:0.80 },
  { name:'Abacate',                      cat:'Gorduras e Oleaginosas', sub:'Gorduras e Oleaginosas', unit:'g',  kcal:160, p:2,  c:8,  f:14, conv:0.20 },
  { name:'Whey Protein Concentrado',     cat:'Suplementos',           sub:'Suplementos em Pó',      unit:'g',  kcal:400, p:75, c:10, f:5,  conv:0.80 },
  { name:'Whey Protein Isolado',         cat:'Suplementos',           sub:'Suplementos em Pó',      unit:'g',  kcal:370, p:90, c:2,  f:1,  conv:0.90 },
  { name:'Albumina',                     cat:'Suplementos',           sub:'Suplementos em Pó',      unit:'g',  kcal:360, p:80, c:5,  f:0,  conv:0.80 },
  { name:'Caseína',                      cat:'Suplementos',           sub:'Suplementos em Pó',      unit:'g',  kcal:360, p:80, c:5,  f:1,  conv:0.80 },
  { name:'Creatina',                     cat:'Suplementos',           sub:'Creatina Isolada',       unit:'g',  kcal:0,   p:0,  c:0,  f:0,  conv:0.00 },
  { name:'Barra de Proteína Bold',       cat:'Suplementos',           sub:'Prontos para Consumo',   unit:'g',  kcal:350, p:33, c:33, f:15, conv:0.33 },
  { name:'YoPRO 15g (Bebida Láctea)',   cat:'Suplementos',           sub:'Prontos para Consumo',   unit:'ml', kcal:45,  p:6,  c:5,  f:0,  conv:0.06 },
  { name:'YoPRO 25g (Bebida Láctea)',   cat:'Suplementos',           sub:'Prontos para Consumo',   unit:'ml', kcal:62,  p:10, c:5,  f:0,  conv:0.10 },
  { name:'Brócolis (Cozido)',           cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:25,  p:2,  c:4,  f:0   },
  { name:'Couve-flor',                  cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:25,  p:2,  c:4,  f:0   },
  { name:'Cenoura (Cozida)',            cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:35,  p:1,  c:8,  f:0   },
  { name:'Abóbora (Cabotiá)',           cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:34,  p:1,  c:8,  f:0   },
  { name:'Beterraba',                   cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:43,  p:2,  c:10, f:0   },
  { name:'Alface (Qualquer tipo)',      cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:14,  p:1,  c:2,  f:0   },
  { name:'Rúcula',                      cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:25,  p:3,  c:4,  f:0   },
  { name:'Tomate',                      cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:18,  p:1,  c:3,  f:0   },
  { name:'Couve (Manteiga)',            cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:35,  p:3,  c:6,  f:0   },
  { name:'Espinafre',                   cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:23,  p:3,  c:4,  f:0   },
  { name:'Abobrinha',                   cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:17,  p:1,  c:3,  f:0   },
  { name:'Berinjela',                   cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:25,  p:1,  c:6,  f:0   },
  { name:'Chuchu',                      cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:19,  p:1,  c:4,  f:0   },
  { name:'Pepino (Com casca)',           cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:15,  p:1,  c:3,  f:0   },
  { name:'Pimentão',                    cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:20,  p:1,  c:4,  f:0   },
  { name:'Vagem',                       cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:31,  p:2,  c:7,  f:0   },
  { name:'Aspargos',                    cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:20,  p:2,  c:4,  f:0   },
  { name:'Repolho',                     cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:25,  p:1,  c:6,  f:0   },
  { name:'Cebola',                      cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:40,  p:1,  c:9,  f:0   },
  { name:'Agrião',                      cat:'Vegetais e Legumes',    sub:'Vegetais e Legumes',     unit:'g',  kcal:11,  p:2,  c:1,  f:0   },
  { name:'Café sem Açúcar',             cat:'Bebidas',               sub:'Bebidas Zero',           unit:'ml', kcal:0,   p:0,  c:0,  f:0   },
  { name:'Chá sem Açúcar',             cat:'Bebidas',               sub:'Bebidas Zero',           unit:'ml', kcal:0,   p:0,  c:0,  f:0   },
  { name:'Suco Clight/Zero',           cat:'Bebidas',               sub:'Bebidas Zero',           unit:'ml', kcal:0,   p:0,  c:0,  f:0   },
  { name:'Gelatina Zero',              cat:'Bebidas',               sub:'Bebidas Zero',           unit:'g',  kcal:5,   p:1,  c:0,  f:0   },
  { name:'Refrigerante Zero',          cat:'Bebidas',               sub:'Bebidas Zero',           unit:'ml', kcal:0,   p:0,  c:0,  f:0   },
  { name:'Água de Coco',              cat:'Bebidas',               sub:'Bebidas Zero',           unit:'ml', kcal:22,  p:0,  c:5,  f:0   },
];

// ─── TACO COMPLETA — carregada do JSON processado ─────────────────────────────
// Cole aqui o JSON gerado pelo script Python, ou leia do arquivo:
// const TACO_FOODS = JSON.parse(fs.readFileSync(path.join(__dirname, 'taco_mapeada.json'), 'utf-8'));

// Mapa de categorias TACO → ELITE FIT
const CAT_MAP: Record<string, [string, string]> = {
  'Cereais e derivados':                   ['Carboidratos',           'Cereais e Fibras'],
  'Verduras, hortaliças e derivados':      ['Vegetais e Legumes',     'Vegetais e Legumes'],
  'Frutas e derivados':                    ['Frutas',                 'Frutas'],
  'Leguminosas e derivados':               ['Carboidratos',           'Leguminosas e Grãos'],
  'Carnes e derivados':                    ['Carnes e Proteínas',     'Proteínas Gerais'],
  'Leite e derivados':                     ['Frios e Laticínios',     'Leites e Iogurtes'],
  'Gorduras e óleos':                      ['Gorduras e Oleaginosas', 'Gorduras e Oleaginosas'],
  'Bebidas (alcoólicas e não alcoólicas)': ['Bebidas',                'Bebidas'],
  'Nozes e sementes':                      ['Gorduras e Oleaginosas', 'Gorduras e Oleaginosas'],
  'Alimentos preparados':                  ['Refeições Prontas',      'Alimentos Preparados'],
  'Produtos açucarados':                   ['Carboidratos',           'Doces e Açúcares'],
  'Ovos e derivados':                      ['Carnes e Proteínas',     'Proteínas Gerais'],
  'Pescados e frutos do mar':              ['Carnes e Proteínas',     'Proteínas Gerais'],
  'Miscelâneas':                           ['Outros',                 'Outros'],
  'Outros alimentos industrializados':     ['Outros',                 'Outros'],
};

async function main() {
  console.log('🌱 Seed de alimentos — ELITE FIT\n');

  // ── 1. CUSTOM (seu catálogo, MASTER_TEAM) ────────────────────────────────
  console.log(`📦 Inserindo ${CUSTOM_FOODS.length} alimentos CUSTOM...`);
  let ok = 0, skip = 0;
  for (const food of CUSTOM_FOODS) {
    const extId = `custom-${food.name.toLowerCase().replace(/[\s\/\(\)]+/g, '-').replace(/-+/g, '-')}`;
    try {
      await (prisma as any).food.upsert({
        where:  { source_externalId: { source: 'CUSTOM', externalId: extId } },
        update: {},
        create: {
          source: 'CUSTOM', externalId: extId, teamId: MASTER_TEAM,
          name: food.name, category: food.cat, subcategory: food.sub,
          baseUnit: food.unit ?? 'g',
          kcal: food.kcal, protein: food.p, carbs: food.c, fat: food.f,
          isLactoseFree: (food as any).lactose ?? false,
          conversionFactor: (food as any).conv ?? 1,
          isFavorite: true, // todos os CUSTOM são favoritos
        },
      });
      ok++;
    } catch { skip++; }
  }
  console.log(`   ✅ ${ok} inseridos | ⏭️  ${skip} já existiam\n`);

  // ── 2. TACO (global, teamId = null) ─────────────────────────────────────
  // Lê o arquivo JSON gerado pelo script Python
  const tacoPath = path.join(__dirname, 'taco_mapeada.json');
  if (!fs.existsSync(tacoPath)) {
    console.log('⚠️  taco_mapeada.json não encontrado. Pule esta etapa.');
    console.log('   Gere o arquivo rodando: python3 prisma/process-taco.py\n');
  } else {
    const tacoFoods = JSON.parse(fs.readFileSync(tacoPath, 'utf-8'));
    console.log(`🥗 Inserindo ${tacoFoods.length} alimentos TACO...`);
    let tok = 0, tskip = 0;
    for (const food of tacoFoods) {
      const [catElite, subcatElite] = CAT_MAP[food.category] ?? ['Outros', 'Outros'];
      try {
        await (prisma as any).food.upsert({
          where:  { source_externalId: { source: 'TACO', externalId: String(food.id) } },
          update: {},
          create: {
            source: 'TACO', externalId: String(food.id), teamId: null,
            name: food.name, category: catElite, subcategory: subcatElite,
            baseUnit: 'g',
            kcal: food.kcal, protein: food.p, carbs: food.c, fat: food.f,
            fiber: food.fiber ?? null,
            isFavorite: food.isFavorite ?? false,
          },
        });
        tok++;
      } catch { tskip++; }
    }
    console.log(`   ✅ ${tok} inseridos | ⏭️  ${tskip} já existiam\n`);
  }

  const total     = await (prisma as any).food.count();
  const favorites = await (prisma as any).food.count({ where: { isFavorite: true } });
  console.log(`🎉 Seed concluído!`);
  console.log(`   Total: ${total} alimentos`);
  console.log(`   Favoritos: ${favorites}`);
  console.log(`   TACO completa: ${total - favorites}`);
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
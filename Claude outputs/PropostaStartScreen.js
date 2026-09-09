// src/screens/PropostaStartScreen.js
import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Linking, Platform, SafeAreaView, Animated, Image, Dimensions
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { linksAlunos } from '../utils/linksAlunos';
import FaqAccordion from '../components/FaqAccordion';
import PlanCard from '../components/PlanCard';
import ExpandableBeforeAfterGrid from '../components/ExpandableBeforeAfterGrid';
import ExpandableWhatsAppGrid from '../components/ExpandableWhatsAppGrid';

const isWeb = Platform.OS === 'web';
const RootComponent = isWeb ? View : SafeAreaView;
const { width } = Dimensions.get('window');

const API_BASE = 'https://fitos-final.onrender.com';

// Verde original do Start
const MAIN_COLOR = '#4DE38F';

// 🔥 Planos padrão (usados até você criar uma oferta em Sistema > Vendas,
// e como fallback se a oferta não carregar). Mesmo formato de card da
// PropostaScreen (PlanCard) — a Ficha usa "unico" (pagamento avulso) em vez
// da grade mensal/trimestral/semestral/anual.
const DEFAULT_CARDS_START = [
    {
        id: 'default-ficha',
        nome: 'FICHA 8 SEMANAS',
        descricao: 'Protocolo direto ao ponto: 56 dias com objetivo definido, avaliação no dia 1 e no dia 56. Ideal pra quem quer resultado concreto em prazo determinado.',
        destaque: false,
        badgeTexto: 'PROTOCOLO FIXO',
        itensInclusos: [
            'Direção exata em cada treino — sem dúvida, sem improviso',
            'Vídeos de execução para acertar cada repetição',
            'Avaliação física no Dia 1 e no Dia 56 para medir a evolução',
            'Suporte no app para não ficar perdido no processo',
            'E-book: 5 Dicas Infalíveis de Emagrecimento incluso',
        ],
        itensExcluidos: [
            'Análise Biomecânica de Vídeo por IA',
            'Calculadora de Cargas (1RM)',
            'Catálogo de Audiobooks e Bônus',
        ],
        itemDestaque: '',
        bonusTitulo: '',
        bonusItens: [],
        precos: { unico: { valor: 97, descontoPerc: 0 } },
        ctaTexto: 'QUERO A FICHA DE 8 SEMANAS',
    },
    {
        id: 'default-start',
        nome: 'PLANO START',
        descricao: 'Acompanhamento mensal renovável. O método aplicado no seu ritmo, com suporte contínuo e reavaliação a cada 30 dias — sem prazo para parar de evoluir.',
        destaque: true,
        badgeTexto: 'MAIS ESCOLHIDO',
        itensInclusos: [
            'Direção exata em cada treino — sem dúvida, sem improviso',
            'Reavaliação a cada 30 dias para ajustar a rota antes de estagnar',
            'Suporte (Fila Standard) — você nunca fica sozinho no processo',
            'Vídeos de execução para acertar cada repetição',
            'E-book: 5 Dicas Infalíveis de Emagrecimento incluso',
            'Migração facilitada para Elite VIP quando você quiser evoluir',
        ],
        itensExcluidos: [
            'Análise Biomecânica de Vídeo por IA',
            'Calculadora de Cargas (1RM)',
            'Catálogo de Audiobooks e Bônus',
        ],
        itemDestaque: '',
        bonusTitulo: '',
        bonusItens: [],
        precos: { mensal: { valor: 69.90, descontoPerc: 0 } },
        ctaTexto: 'QUERO COMEÇAR DO JEITO CERTO',
    },
];

const faqList = [
    { q: "Para quem são os planos Start e Fichas?", a: "Para quem tem disciplina para treinar sozinho, mas cansou de seguir treinos genéricos entregues em papéis de academia. No nosso app, você tem a direção exata com a metodologia de um Campeão Natural." },
    { q: "Eu vou ter acompanhamento no WhatsApp?", a: "Sim! Você terá acesso ao nosso PA Coach AI 24h direto no app para tirar dúvidas sobre a metodologia instantaneamente. Além disso, o nosso suporte via WhatsApp fica disponível no formato 'Fila Standard' (onde a prioridade de resposta imediata é exclusiva dos alunos Elite VIP)." },
    { q: "Em quanto tempo eu vejo resultados no meu corpo?", a: "A ciência não falha. Seguindo a metodologia e os treinos em vídeo do aplicativo, nossos alunos relatam mudanças visíveis logo nas primeiras semanas de execução." },
    { q: "Como funciona a Ficha de 8 Semanas?", a: "É um protocolo de 56 dias focado num objetivo específico (como pernas, hipertrofia ou emagrecimento). Você faz uma avaliação no dia 1 e outra no dia 56 para medirmos sua evolução." },
    { q: "Posso evoluir para a consultoria completa depois?", a: "Sim, e é exatamente assim que funciona para muitos alunos. Você começa pelo Start, aplica o método, sente a diferença — e quando estiver pronto, a migração para o plano Elite VIP ou Performance é simples e sem burocracia." }
];

// 🔥 SmartBanner: mede a proporção real da imagem (Image.resolveAssetSource,
// API pública do RN) e calcula a altura pra caber a largura do container sem
// cortar nem esticar. Mesmo padrão usado na PropostaScreen/CoachProposta.
const SmartBanner = ({ source, children, style }) => {
    const [imageHeight, setImageHeight] = useState(200);

    const screenWidth = Dimensions.get('window').width;
    const maxWidth = 600;
    const availableWidth = screenWidth > maxWidth ? maxWidth : screenWidth;
    const paddingHorizontal = 50; // acompanha o padding 25 do scrollContent (25 de cada lado)
    const containerWidth = availableWidth - paddingHorizontal;

    useEffect(() => {
        let isMounted = true;
        const updateHeight = (w, h) => {
            if (isMounted && w && h) {
                setImageHeight((containerWidth * h) / w);
            }
        };

        if (typeof source === 'number') {
            const sourceAsset = Image.resolveAssetSource(source);
            if (sourceAsset) { updateHeight(sourceAsset.width, sourceAsset.height); }
        } else if (source && source.uri) {
            Image.getSize(source.uri, (w, h) => { updateHeight(w, h); }, () => {});
        }
        return () => { isMounted = false; };
    }, [source, containerWidth]);

    return (
        <View style={[styles.smartBannerContainer, style, { height: imageHeight }]}>
            <Image source={source} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} resizeMode="cover" />
            {children && (<View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>{children}</View>)}
        </View>
    );
};

// 🔥 MentorCarousel: mesmo carrossel (e mesmas artes) usado na Proposta —
// texto e fotos são genéricos, não falam de plano nenhum, então dá pra
// reaproveitar 100% aqui na página do Start.
const MentorCarousel = () => {
    const screenWidth = Dimensions.get('window').width;
    const maxWidth = 600;
    const availableWidth = screenWidth > maxWidth ? maxWidth : screenWidth;
    const containerWidth = availableWidth - 50;

    return (
        <View style={styles.smartBannerContainer}>
            <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={true}
                nestedScrollEnabled={true}
            >
                <View style={{ width: containerWidth }}>
                    <SmartBanner
                        source={require('../../assets/mentor-app.png')}
                        style={{ marginBottom: 0, borderWidth: 0, borderRadius: 0 }}
                    />
                </View>
                <View style={{ width: containerWidth }}>
                    <SmartBanner
                        source={require('../../assets/mentor-transformacao.jpg')}
                        style={{ marginBottom: 0, borderWidth: 0, borderRadius: 0 }}
                    />
                </View>
            </ScrollView>
        </View>
    );
};

export default function PropostaStartScreen({ route }) {
    const rawName = route?.params?.nome?.trim() || '';
    const genericNames = ['novo aluno', 'nova aluna', 'aluno', 'aluna', 'teste', 'atleta', 'lead', 'cliente'];
    const isGeneric = !rawName || genericNames.includes(rawName.toLowerCase());
    const displayName = isGeneric ? 'ATLETA' : rawName.toUpperCase();

    // 🔑 Chave do timer: usa o ID único do link (gerado pelo AdminInviteModal)
    // em vez do nome do lead. Evita colisão entre testes/leads repetidos.
    const linkId = route?.params?.id?.trim() || '';
    const storageKeyName = linkId || (isGeneric ? 'default_lead' : rawName.toLowerCase());

    // 🔥 ROTEAMENTO INTELIGENTE DE WHATSAPP (PAULO OU ADRI) 🔥
    // Lê o parâmetro ?coach= embutido pelo AdminInviteModal na hora de gerar o link.
    const coachParam = route?.params?.coach?.trim()?.toLowerCase() || '';
    const telefoneParam = route?.params?.telefone?.trim() || '';

    let waNumber = '5541997991346'; // Padrão: Paulo
    if (telefoneParam) {
        waNumber = telefoneParam.replace(/\D/g, '');
    } else if (['adri', 'adriele', 'japinha'].includes(coachParam)) {
        waNumber = '5541998465582'; // Redireciona para a Adri
    }

    // 🔥 Oferta dinâmica (Sistema > Vendas > Proposta Start no admin) — se
    // existir uma oferta ativa com esse slug pra "pagina=start", ela
    // substitui os cards padrão. Mesmo mecanismo da PropostaScreen.
    const ofertaSlug = route?.params?.oferta?.trim() || '';
    const [cards, setCards] = useState(DEFAULT_CARDS_START);

    useEffect(() => {
        if (!ofertaSlug) return;
        let cancelado = false;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/proposta-ofertas?pagina=start&slug=${encodeURIComponent(ofertaSlug)}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelado && data?.oferta?.cards?.length) {
                    setCards(data.oferta.cards);
                }
            } catch (e) {
                console.log('Erro ao buscar oferta do Start, usando preços padrão', e);
            }
        })();
        return () => { cancelado = true; };
    }, [ofertaSlug]);

    const [timeLeft, setTimeLeft] = useState(null);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const initTimer = async () => {
            try {
                const storedTime = await AsyncStorage.getItem(`@expire_time_start_${storageKeyName}`);
                const now = Date.now();
                let expireTime;
                if (storedTime) {
                    expireTime = parseInt(storedTime, 10);
                } else {
                    expireTime = now + (24 * 60 * 60 * 1000);
                    await AsyncStorage.setItem(`@expire_time_start_${storageKeyName}`, expireTime.toString());
                }
                const diff = Math.floor((expireTime - now) / 1000);
                setTimeLeft(diff > 0 ? diff : 0);
            } catch (e) {
                setTimeLeft(24 * 60 * 60);
            }
        };
        initTimer();
    }, [storageKeyName]);

    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0) return;
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) { clearInterval(interval); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [timeLeft]);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const formatTime = (seconds) => {
        if (seconds === null) return "Calculando...";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const handleWhatsAppCTA = (plan) => {
        const text = `Fala, Coach! Quero começar minha transformação com o ${plan}. Bora! 👊`;
        Linking.openURL(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`);
    };

    const renderYouTubeVideo = (videoId, isAutoPlay = false) => {
        const autoPlayParams = isAutoPlay ? `&autoplay=1&mute=1&loop=1&playlist=${videoId}` : '';
        if (isWeb) {
            return React.createElement('iframe', {
                src: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1${autoPlayParams}`,
                style: { width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 },
                allowFullScreen: true,
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            });
        }
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <MaterialCommunityIcons name="youtube" size={40} color="#FF0000" />
                <Text style={{ color: '#FFF', marginTop: 10 }}>Vídeo disponível na versão Web</Text>
            </View>
        );
    };

    if (timeLeft === 0) {
        return (
            <RootComponent style={styles.container}>
                <View style={styles.expiredBox}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={64} color="#FF3B30" />
                    <Text style={styles.expiredTitle}>OFERTA EXPIRADA</Text>
                    <Text style={styles.expiredDesc}>O seu convite perdeu a validade. Fale com o suporte.</Text>
                    <TouchableOpacity style={styles.expiredBtn} onPress={() => handleWhatsAppCTA('Lista de Espera')}>
                        <Text style={styles.expiredBtnText}>FALAR COM O SUPORTE</Text>
                    </TouchableOpacity>
                </View>
            </RootComponent>
        );
    }

    return (
        <RootComponent style={styles.container}>
            <Image source={{ uri: linksAlunos.background }} style={styles.backgroundImage} blurRadius={2} />

            <View style={styles.webWrapper}>
                <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* ── HERO ─────────────────────────────────────────────────── */}
                    <View style={styles.heroSection}>
                        {/* 🔥 Banner full-bleed (mesmo espírito do banner "coach" da
                            Biblioteca/elitefit_banner_generic.png), substitui o logo
                            pequeno flutuante que deixava espaço vazio sobrando. */}
                        <SmartBanner
                            source={require('../../assets/pa-elite-team-hero-banner.png')}
                            style={styles.brandBanner}
                        />
                        <View style={styles.timerBadge}>
                            <MaterialCommunityIcons name="timer-sand" size={16} color="#FF3B30" />
                            <Text style={styles.timerText}>ESTE LINK EXPIRA EM: {formatTime(timeLeft)}</Text>
                        </View>
                        <Text style={styles.heroGreeting}>FALA, {displayName}! ⚡</Text>

                        <SmartBanner source={require('../../assets/hero-start-app.png')} />

                        {/* Reframe: não é produto de segunda linha */}
                        <View style={styles.reframeBox}>
                            <MaterialCommunityIcons name="information-outline" size={18} color={MAIN_COLOR} />
                            <Text style={styles.reframeText}>
                                Muitos dos alunos que hoje estão no Elite VIP começaram exatamente por aqui.
                                O Start não é um atalho — é a porta certa para quem quer começar sem erro.
                            </Text>
                        </View>
                    </View>

                    {/* ── PLANOS — PREÇO NO TOPO ────────────────────────────────── */}
                    {/* 🔜 Pendente: virar banner (comparativo-start-app.png) — mantido em
                        código por enquanto até a arte ficar pronta. Preço/conteúdo dos
                        cards agora vem de "cards" (editável em Sistema > Vendas > Proposta
                        Start no admin), com DEFAULT_CARDS_START como fallback. */}
                    <Text style={styles.sectionTitle}>ESCOLHA SEU PONTO DE PARTIDA</Text>
                    <Text style={styles.sectionSub}>
                        Dois formatos. Um método. Escolha o que faz sentido para o seu momento agora.
                    </Text>

                    <View style={styles.plansContainer}>
                        {cards.map((card) => (
                            <PlanCard key={card.id} card={card} pulseAnim={pulseAnim} onBuy={handleWhatsAppCTA} />
                        ))}
                    </View>

                    {/* ── VÍDEO PRINCIPAL ───────────────────────────────────────── */}
                    <View style={styles.videoSection}>
                        <Text style={styles.sectionTitle}>NÃO ACREDITE SÓ EM MIM</Text>
                        <Text style={styles.sectionSub}>Veja quem já transformou o corpo e a rotina porque decidiu parar de tentar sozinho.</Text>
                        <View style={styles.videoContainer9x16}>
                            {renderYouTubeVideo('tvYMAVQpt8I', false)}
                        </View>
                    </View>

                    {/* ── ARSENAL / A RESPOSTA PARA SEUS PROBLEMAS ──────────────── */}
                    <SmartBanner source={require('../../assets/resposta-problemas-start-app.png')} style={{ marginTop: 15, marginBottom: 15 }} />

                    {/* 🔥 SEM demo de IA aqui de propósito: Ficha 8 Semanas e Plano Start
                        excluem explicitamente a Análise Biomecânica por IA (ver planCard
                        acima) — esse banner é exclusivo dos planos Performance/Elite VIP. */}

                    {/* ── MENTOR ────────────────────────────────────────────────── */}
                    <View style={{ marginTop: 15 }}>
                        <MentorCarousel />
                    </View>

                    {/* ── PROVA SOCIAL ──────────────────────────────────────────── */}
                    <SmartBanner source={require('../../assets/dor-tem-solucao-app.png')} style={{ marginBottom: 5, marginTop: 15 }} />
                    <SmartBanner source={require('../../assets/subtitulo-resultados-app.png')} style={{ marginBottom: 25, borderWidth: 0, backgroundColor: 'transparent' }} />
                    <View style={styles.listPadding}>
                        <ExpandableBeforeAfterGrid />
                    </View>

                    {/* ── FEEDBACKS WHATSAPP ────────────────────────────────────── */}
                    <SmartBanner source={require('../../assets/feedbacks-app.png')} style={{ marginBottom: 5 }} />
                    <SmartBanner source={require('../../assets/subtitulo-feedbacks-app.png')} style={{ marginBottom: 25, borderWidth: 0, backgroundColor: 'transparent' }} />
                    <View style={styles.listPadding}>
                        <ExpandableWhatsAppGrid />
                    </View>

                    {/* ── BÔNUS ─────────────────────────────────────────────────── */}
                    <SmartBanner source={require('../../assets/bonus-start-app.png')} />

                    {/* ── FAQ ───────────────────────────────────────────────────── */}
                    <SmartBanner source={require('../../assets/titulo-faq.png')} style={{ marginBottom: 20 }} />
                    <FaqAccordion faqs={faqList} />

                    {/* ── FECHAMENTO ────────────────────────────────────────────── */}
                    <SmartBanner source={require('../../assets/cta-final-app.png')} style={{ marginTop: 30, marginBottom: 20 }}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => handleWhatsAppCTA('Plano Start')} style={styles.absoluteCtaBox}>
                            <Animated.Text adjustsFontSizeToFit numberOfLines={1} style={[styles.absoluteCtaText, { transform: [{ scale: pulseAnim }] }]}>
                                QUERO COMEÇAR DO JEITO CERTO
                            </Animated.Text>
                        </TouchableOpacity>
                    </SmartBanner>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>ELITE FIT © 2026</Text>
                        <Text style={styles.footerSubText}>Página segura. Oferta com tempo limitado.</Text>
                    </View>
                </ScrollView>
            </View>
        </RootComponent>
    );
}

const styles = StyleSheet.create({
    container: { height: isWeb ? '100vh' : '100%', backgroundColor: '#0a0a0a', position: 'relative' },
    backgroundImage: { width: '100%', height: '100%', resizeMode: 'cover', position: 'absolute', top: 0, left: 0, opacity: 0.15 },
    webWrapper: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#222', backgroundColor: 'rgba(17,17,17,0.9)' },
    scrollContent: { flexGrow: 1, padding: 25, paddingBottom: 120 },

    // ── Hero
    heroSection: { alignItems: 'center', marginTop: 20, marginBottom: 40 },
    brandBanner: { marginBottom: 20 },
    timerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF3B3015', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#FF3B30', marginBottom: 25 },
    timerText: { color: '#FF3B30', fontWeight: '900', fontSize: 12, marginLeft: 8, letterSpacing: 1 },
    heroGreeting: { color: '#888', fontWeight: '900', fontSize: 14, letterSpacing: 2, marginBottom: 15 },
    reframeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: `${MAIN_COLOR}10`, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: `${MAIN_COLOR}25`, marginTop: 20, width: '100%' },
    reframeText: { flex: 1, color: '#AAA', fontSize: 13, lineHeight: 20, fontStyle: 'italic' },

    // ── Banners (mesmo padrão de altura automática da PropostaScreen)
    smartBannerContainer: {
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 25,
        backgroundColor: '#111',
        borderWidth: 1,
        borderColor: '#1a1a1a',
        alignSelf: 'center',
    },

    // ── Seções genéricas
    sectionTitle: { color: '#FFF', fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5, marginBottom: 5 },
    sectionSub: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 20, paddingHorizontal: 10 },
    listPadding: { width: '100%', marginBottom: 30 },

    // ── Vídeo
    videoSection: { marginTop: 40, marginBottom: 50 },
    videoContainer9x16: { width: '100%', maxWidth: 280, aspectRatio: 9 / 16, backgroundColor: '#222', borderRadius: 16, overflow: 'hidden', alignSelf: 'center', marginTop: 20, borderWidth: 1, borderColor: '#333', position: 'relative' },

    // ── Planos (cards em si são renderizados pelo PlanCard, com estilos próprios)
    plansContainer: { gap: 25, marginTop: 10, marginBottom: 40 },

    // ── CTA final (texto escrito por código sobre o banner)
    absoluteCtaBox: {
        position: 'absolute',
        bottom: isWeb ? '10%' : '12%',
        left: '5%',
        right: '5%',
        height: '18%',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    absoluteCtaText: {
        color: '#FFFFFF',
        fontWeight: '900',
        fontSize: isWeb ? 20 : 14,
        textShadowColor: 'rgba(77, 227, 143, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
        letterSpacing: isWeb ? 1 : 0,
    },

    // ── Expirado
    expiredBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#0a0a0a' },
    expiredTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', marginTop: 20, marginBottom: 10, letterSpacing: 1 },
    expiredDesc: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 30 },
    expiredBtn: { backgroundColor: '#222', padding: 18, borderRadius: 16, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#444' },
    expiredBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 },

    // ── Rodapé
    footer: { marginTop: 30, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#222', paddingTop: 20 },
    footerText: { color: '#666', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
    footerSubText: { color: '#444', fontSize: 10, marginTop: 5 },
});

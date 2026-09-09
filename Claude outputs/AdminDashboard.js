import React, { useState, useMemo, useEffect, useCallback } from 'react';

import { View, StyleSheet, ActivityIndicator, StatusBar, RefreshControl, ScrollView, Alert, Platform, TouchableOpacity, Text, Image, useWindowDimensions } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect } from '@react-navigation/native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';



// Contextos e Hooks

import { useTheme } from '../contexts/ThemeContext';

import { useAdminDashboard } from '../hooks/useAdminDashboard';

import { authHeaders } from '../utils/authToken';



// Utilitários

import { getExpirationStatus, getCheckinStatus } from '../utils/adminHelpers';



// Componentes Modulares

import AdminNavigation from '../components/Admin/AdminNavigation';

import TabAlunos from '../components/Admin/TabAlunos';

import TabCheckins from '../components/Admin/TabCheckins';

import TabFeed from '../components/Admin/TabFeed';

import TabGestao from '../components/Admin/TabGestao';

import AdminFilterWizard from '../components/Admin/AdminFilterWizard';

import PendingCoachesPanel from '../components/Admin/PendingCoachesPanel';

import CoachOnboarding from '../components/Admin/CoachOnboarding'; // ← v2



// Outros Componentes e Modais

import SendNoticeModal from '../components/SendNoticeModal';

import AdminInviteModal from '../components/AdminInviteModal';

import AdminCheckinModal from '../components/Admin/AdminCheckinModal';

import DisparoNPSModal from '../components/Admin/DisparoNPSModal';

import AdminFinanceSystem from '../components/AdminFinanceSystem';

import EliteAssistant from '../components/Admin/EliteAssistant'; // ← v2



const MENU_TABS = [

    { id: 'ALUNOS',   label: 'GERENCIAR ALUNOS',        shortLabel: 'ALUNOS',    icon: 'account-group'  },

    { id: 'FINANCAS', label: 'GESTÃO FINANCEIRA',        shortLabel: 'FINANÇAS',  icon: 'cash-multiple'  },

    { id: 'CHECKINS', label: 'AVALIAÇÕES E FOTOS',       shortLabel: 'AVALIAÇÕES',icon: 'camera-timer'   },

    { id: 'FEED',     label: 'FEED DE ATIVIDADES',       shortLabel: 'FEED',      icon: 'history'        },

    { id: 'GESTAO',   label: 'SISTEMA E CONFIGURAÇÕES',  shortLabel: 'SISTEMA',   icon: 'cog'            },

];



const OPT_STATUS = [

    { id: 'TODOS',      label: 'Todos'                        },

    { id: 'PENDENTES',  label: 'Avaliação Pendente'           },

    { id: 'ATRASADOS',  label: 'Atrasados (Treino/Foto)'      },

    { id: 'ALERTA',     label: 'Alerta (Vence 7D)'            },

    { id: 'OK',         label: 'No Prazo'                     },

    { id: 'SEM_TREINO', label: 'Sem Treino'                   },

];



const OPT_INTENSIDADE = [

    { id: 'TODOS',  label: 'Todas'                       },

    { id: 'CHOQUE', label: 'Semana de Choque'            },

    { id: 'DELOAD', label: 'Deload Ativo / Menstrual'    },

];



const OPT_PLANOS = [

    { id: 'TODOS',           label: 'Todos'         },

    { id: 'PLAN_ELITE',      label: 'Elite'         },

    { id: 'PLAN_PERFORMANCE',label: 'Performance'   },

    { id: 'PLAN_FICHA_8S',   label: 'Ficha 8S'      },

    { id: 'PLAN_LOW_COST',   label: 'Low Cost'      },

    { id: 'PLAN_CHALLENGE_21',label: 'Desafio 21D'  },

];



export default function AdminDashboard({ navigation }) {

  const { theme, changeTheme } = useTheme();

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const isWeb   = Platform.OS === 'web';

  const isWebPC = isWeb && windowWidth > 768;

  const containerMaxWidth  = isWebPC ? 960 : '100%';

  const containerBorders   = isWebPC ? {

      borderLeftWidth: 1, borderRightWidth: 1,

      borderBottomWidth: 1, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,

      borderColor: theme.border,

  } : {};

  const lateralSpace = isWebPC ? (windowWidth - 960) / 2 : 0;

  const webOuterBg   = '#0a0a0a';



  const {

      alunosAtivos, alunosInativos, feed, checkins, dietFeedbacks, surveys,

      loading, refreshing, adminEmail, adminId, coachFilter, setCoachFilter,

      isAdriLogged, isMaster, fetchData, handleMarkFeedbackRead, handleMarkSurveyRead,

      handleDeleteFeedback, handleDeleteLog, getLogCoach,

  } = useAdminDashboard();



  const [activeTab,       setActiveTab]       = useState('ALUNOS');

  const [isMenuVisible,   setIsMenuVisible]   = useState(false);

  const [subTabAlunos,    setSubTabAlunos]    = useState('ATIVOS');

  const [subTabCheckins,  setSubTabCheckins]  = useState('AVALIACOES');

  const [subTabGestao,    setSubTabGestao]    = useState('FERRAMENTAS');



  const [filterStatus,      setFilterStatus]      = useState('TODOS');

  const [filterIntensidade, setFilterIntensidade] = useState('TODOS');

  const [filterPlano,       setFilterPlano]       = useState('TODOS');

  const [filterStep,        setFilterStep]        = useState(1);

  const [filterModalVisible,setFilterModalVisible]= useState(false);



  const [visibleCount,         setVisibleCount]         = useState(15);

  const [visibleCountCheckins, setVisibleCountCheckins] = useState(5);

  const [visibleCountDiet,     setVisibleCountDiet]     = useState(5);

  const [visibleCountSurveys,  setVisibleCountSurveys]  = useState(5);

  const [visibleCountFeed,     setVisibleCountFeed]     = useState(10);

  const [search, setSearch] = useState('');



  const [selectedCheckin,      setSelectedCheckin]      = useState(null);

  const [checkinModalVisible,  setCheckinModalVisible]  = useState(false);

  const [isResolving,          setIsResolving]          = useState(false);



  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);

  const [isNpsModalOpen,    setIsNpsModalOpen]    = useState(false);

  const [inviteModalVisible,setInviteModalVisible]= useState(false);



  const [partnerLogoUrl, setPartnerLogoUrl] = useState(null);



  const [birthdays,          setBirthdays]          = useState([]);

  const [birthdayDismissed,  setBirthdayDismissed]  = useState(false);

  const [isBirthdaysExpanded,setIsBirthdaysExpanded]= useState(false);



  const [coachCheckTrigger, setCoachCheckTrigger] = useState(0);



  useFocusEffect(useCallback(() => { fetchData(false); }, []));



  useEffect(() => {

      setVisibleCount(15); setVisibleCountCheckins(5); setVisibleCountDiet(5);

      setVisibleCountSurveys(5); setVisibleCountFeed(10);

  }, [subTabAlunos, subTabCheckins, activeTab, search, filterStatus, filterIntensidade, filterPlano, coachFilter]);



  useEffect(() => {

      if (adminId) {

          fetchBirthdays();

          if (!isMaster) {

              authHeaders().then(hdrs => fetch(`https://fitos-final.onrender.com/api/admin/saas-meta?coachId=${adminId}`, { headers: hdrs }))

                  .then(res => res.json())

                  .then(data => { if (data && data.brandLogoUrl) setPartnerLogoUrl(data.brandLogoUrl); })

                  .catch(e => console.log('Erro ao buscar logo parceiro:', e));

          }

      }

  }, [adminId, isMaster]);



  const fetchBirthdays = async () => {

      if (!adminId) return;

      try {

          const CACHE_KEY  = `@birthdays_cache_${adminId}`;

          const CACHE_DATE = `@birthdays_date_${adminId}`;

          const today      = new Date().toISOString().split('T')[0];

          const lastDate   = await AsyncStorage.getItem(CACHE_DATE);

          if (lastDate === today) {

              const cached = await AsyncStorage.getItem(CACHE_KEY);

              if (cached) { setBirthdays(JSON.parse(cached)); return; }

          }

          const res = await fetch(`https://fitos-final.onrender.com/api/admin/birthdays?adminId=${adminId}&days=7`, {

              headers: { ...(await authHeaders()) },

          });

          if (!res.ok) return;

          const data = await res.json();

          setBirthdays(data);

          setBirthdayDismissed(false);

          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));

          await AsyncStorage.setItem(CACHE_DATE, today);

          const todayBirthdays = data.filter(b => b.daysUntil === 0);

          if (todayBirthdays.length > 0) {

              const pushKey  = `@birthday_push_${adminId}_${today}`;

              const pushSent = await AsyncStorage.getItem(pushKey);

              if (!pushSent) {

                  const names    = todayBirthdays.map(b => b.name?.split(' ')[0]).join(', ');

                  const userJson = await AsyncStorage.getItem('user');

                  if (userJson) {

                      const user = JSON.parse(userJson);

                      if (user.pushToken) {

                          await fetch('https://exp.host/--/api/v2/push/send', {

                              method: 'POST',

                              headers: { 'Content-Type': 'application/json' },

                              body: JSON.stringify({

                                  to: user.pushToken, sound: 'default',

                                  title: '🎂 Aniversário hoje!',

                                  body: `${names} ${todayBirthdays.length > 1 ? 'fazem' : 'faz'} aniversário hoje. Que tal parabenizar?`,

                              }),

                          }).catch(() => {});

                      }

                  }

                  await AsyncStorage.setItem(pushKey, 'sent');

              }

          }

      } catch (e) { console.log('Erro ao buscar aniversários:', e); }

  };



  const ownerKey   = isAdriLogged ? 'ADRI'  : 'PAULO';

  const partnerKey = isAdriLogged ? 'PAULO' : 'ADRI';



  let activeFiltersCount = 0;

  if (filterStatus      !== 'TODOS') activeFiltersCount++;

  if (filterIntensidade !== 'TODOS') activeFiltersCount++;

  if (filterPlano       !== 'TODOS') activeFiltersCount++;



  const displayList = useMemo(() => {

      let list = subTabAlunos === 'ATIVOS' ? alunosAtivos : alunosInativos;

      if (search) list = list.filter(a => (a.name || '').toLowerCase().includes(search.toLowerCase()));

      list = list.filter(a => getLogCoach(a) === coachFilter);



      if (filterPlano !== 'TODOS') {

          const targetPlan = filterPlano.replace('PLAN_', '');

          list = list.filter(a => {

              let currentPlan = String(a.plan || 'ELITE').toUpperCase();

              if (['VIP', 'PREMIUM'].includes(currentPlan)) currentPlan = 'ELITE';

              return currentPlan === targetPlan;

          });

      }

      if (filterIntensidade !== 'TODOS') {

          list = list.filter(a => {

              const activeWorkout = (a.workouts && a.workouts.length > 0) ? a.workouts[0] : null;

              if (filterIntensidade === 'DELOAD') return (activeWorkout?.intensityMultiplier || 1) < 1 || a.isMenstruating;

              if (filterIntensidade === 'CHOQUE') return (activeWorkout?.intensityMultiplier || 1) > 1;

              return true;

          });

      }

      if (filterStatus !== 'TODOS') {

          list = list.filter(a => {

              if (filterStatus === 'PENDENTES') return (a._count?.checkIns || 0) > 0;

              const activeWorkout = (a.workouts && a.workouts.length > 0) ? a.workouts[0] : null;

              if (filterStatus === 'ATRASADOS') return getCheckinStatus(a) || (getExpirationStatus(activeWorkout)?.cat === 'ATRASADOS');

              if (!activeWorkout) return filterStatus === 'SEM_TREINO';

              return getExpirationStatus(activeWorkout)?.cat === filterStatus;

          });

      }

      return list;

  }, [alunosAtivos, alunosInativos, subTabAlunos, search, filterStatus, filterIntensidade, filterPlano, coachFilter, getLogCoach]);



  const filteredFeed    = useMemo(() => feed.filter(item => getLogCoach(item) === coachFilter), [feed, coachFilter, getLogCoach]);

  const filteredDiet    = useMemo(() => dietFeedbacks.filter(item => getLogCoach(item) === coachFilter), [dietFeedbacks, coachFilter, getLogCoach]);

  const filteredSurveys = useMemo(() => surveys.filter(item => getLogCoach(item) === coachFilter), [surveys, coachFilter, getLogCoach]);

  const filteredCheckins = useMemo(() => checkins.filter(item => {

      const coach = getLogCoach(item);

      if (coach !== coachFilter) return false;

      if (coach === 'ADRI'  && !isAdriLogged) return false;

      if (coach === 'PAULO' && isAdriLogged)  return false;

      return true;

  }), [checkins, coachFilter, getLogCoach, isAdriLogged]);



  const unreadFeedbacksCount = filteredDiet.filter(f => !f.read).length;

  const unreadSurveysCount   = filteredSurveys.filter(s => !s.readByAdmin).length;

  const totalAlerts          = filteredCheckins.length + unreadFeedbacksCount + unreadSurveysCount;



  const handleLogout = async () => {

      await AsyncStorage.multiRemove(['user', 'role', '@dashboard_cache', '@global_exercises']);

      if (Platform.OS === 'web') window.location.replace('/');

      else navigation.reset({ index: 0, routes: [{ name: 'Login' }] });

  };



  // 🔥 A cor escolhida vive dentro do próprio `theme` persistido (theme.colorKey)
  // em vez de um estado local à parte — assim ela sobrevive a reload/F5 igual
  // ao resto do tema, sem resetar pra "verde" sozinha.
  const selectedColor     = theme.colorKey || 'verde';

  const toggleDarkMode    = () => changeTheme(!theme.isDark, selectedColor);

  const selectThemeColor  = (colorKey) => changeTheme(theme.isDark, colorKey);

  const switchSubTab      = (tab) => { setSubTabAlunos(tab); setSearch(''); setVisibleCount(15); };



  const handleHeaderReload = (...args) => {

      fetchData(...args);

      setCoachCheckTrigger(t => t + 1);

  };



  const handleResolveCheckin = () => {

      const confirmAction = async () => {

          setIsResolving(true);

          try {

              const res = await fetch('https://fitos-final.onrender.com/api/checkin/evaluate', {

                  method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },

                  body: JSON.stringify({

                      checkinId: selectedCheckin.id,

                      coachFeedback: "*Avaliação Finalizada!* 🎯\n\nSeu laudo completo foi gerado com sucesso. Vá até a sua tela de **Evolução** no aplicativo para conferir a análise e o seu planejamento.",

                      silent: true,

                  }),

              });

              if (res.ok) {

                  setCheckinModalVisible(false);

                  fetchData(true);

                  if (Platform.OS === 'web') window.alert('Baixa realizada com sucesso!');

              } else {

                  if (Platform.OS === 'web') window.alert('Erro ao dar baixa.');

                  else Alert.alert('Erro', 'Não foi possível atualizar o check-in.');

              }

          } catch (e) {

              if (Platform.OS === 'web') window.alert('Erro de conexão.');

              else Alert.alert('Erro', 'Erro de conexão.');

          } finally { setIsResolving(false); }

      };

      if (Platform.OS === 'web') {

          if (window.confirm("Marcar como 'Avaliado' para remover o aviso vermelho?")) confirmAction();

      } else {

          Alert.alert('Remover Alerta', "Marcar como 'Avaliado' para remover o aviso vermelho?", [

              { text: 'Cancelar', style: 'cancel' },

              { text: 'Sim', onPress: confirmAction },

          ]);

      }

  };



  const RootComponent = isWeb ? View : SafeAreaView;

  const rootStyle = isWeb

      ? { height: '100vh', width: '100%', backgroundColor: isWebPC ? webOuterBg : theme.bg }

      : { flex: 1, backgroundColor: theme.bg };



  return (

    <RootComponent style={rootStyle}>

      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />



      {/* LATERAIS COM LOGOS NO PC */}

      {isWebPC && lateralSpace > 10 && (

          <View key={`lateral-${isMaster}-${theme.isDark}`} style={[StyleSheet.absoluteFill, { zIndex: -1, pointerEvents: 'none' }]}>

              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: lateralSpace, justifyContent: 'center', alignItems: 'center' }}>

                  {isMaster ? (

                      <Image source={require('../../assets/logopaelite.png')} style={{ width: '85%', height: '60%', resizeMode: 'contain' }} />

                  ) : partnerLogoUrl ? (

                      <Image source={{ uri: partnerLogoUrl }} style={{ width: '85%', height: '60%', resizeMode: 'contain' }} />

                  ) : null}

              </View>

              <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: lateralSpace, justifyContent: 'center', alignItems: 'center' }}>

                  {isMaster ? (

                      <Image source={require('../../assets/logopaelite.png')} style={{ width: '85%', height: '60%', resizeMode: 'contain' }} />

                  ) : partnerLogoUrl ? (

                      <Image source={{ uri: partnerLogoUrl }} style={{ width: '85%', height: '60%', resizeMode: 'contain' }} />

                  ) : null}

              </View>

          </View>

      )}



      <ScrollView

          style={{ flex: 1, width: '100%', backgroundColor: isWebPC ? 'transparent' : theme.bg }}

          contentContainerStyle={{ alignItems: 'center', paddingBottom: 150 }}

          showsVerticalScrollIndicator={false}

          refreshControl={activeTab !== 'FINANCAS'

              ? <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={theme.accent} />

              : undefined}

      >

          <View style={{ width: '100%', maxWidth: containerMaxWidth, backgroundColor: theme.bg, ...containerBorders, paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 30 : 20, paddingBottom: 40, minHeight: '100%' }}>



              {/* BANNER CENTRAL */}

              <View style={{ marginBottom: 20, borderRadius: 20, overflow: 'hidden', height: 200, backgroundColor: '#000000', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.isDark ? theme.border : '#222' }}>



                  {/* BOTÕES FLUTUANTES DENTRO DO BANNER */}

                  <View style={{ position: 'absolute', top: 15, right: 15, flexDirection: windowWidth > 600 ? 'row' : 'column', gap: 8, zIndex: 10 }}>

                      <TouchableOpacity onPress={toggleDarkMode} style={[styles.bannerBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>

                          <MaterialCommunityIcons name={theme.isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} size={20} color={theme.text} />

                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleHeaderReload(true)} style={[styles.bannerBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>

                          <MaterialCommunityIcons name="refresh" size={20} color={theme.accent} />

                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleLogout} style={[styles.bannerBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>

                          <MaterialCommunityIcons name="logout" size={20} color="#FF3B30" />

                      </TouchableOpacity>

                  </View>



                  {isMaster ? (

                      <Image source={{ uri: 'https://i.postimg.cc/DZb2WxSn/Design-sem-nome-(1).png' }} style={{ width: '100%', height: '100%', resizeMode: 'cover', zIndex: 2 }} />

                  ) : (

                      // 🔥 Banner genérico do coach parceiro (não é a marca individual dele --
                      // essa já aparece nas laterais via partnerLogoUrl). Era uma arte antiga
                      // hospedada fora do projeto (postimg) com a marca PA ELITE TEAM; trocado
                      // pelo mesmo asset local ELITE FIT usado na capa "TODOS" da Biblioteca.
                      <Image source={require('../../assets/elitefit_banner_generic.png')} style={{ width: '100%', height: '100%', resizeMode: 'cover', zIndex: 2 }} />

                  )}

              </View>



              {/* ANIVERSARIANTES */}

              {!birthdayDismissed && birthdays.length > 0 && (

                  <View style={[styles.miniBirthdayPill, { backgroundColor: theme.accent + '20' }]}>

                      <TouchableOpacity

                          style={{ flexDirection: 'row', alignItems: 'center' }}

                          activeOpacity={0.8}

                          onPress={() => setIsBirthdaysExpanded(!isBirthdaysExpanded)}

                      >

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>

                              <MaterialCommunityIcons name="cake-variant" size={16} color={theme.accent} />

                              <Text style={[styles.miniBirthdayText, { color: theme.text, fontSize: 13 }]}>

                                  {birthdays.length} {birthdays.length > 1 ? 'aniversariantes' : 'aniversariante'} nos próximos dias

                              </Text>

                          </View>

                          <MaterialCommunityIcons name={isBirthdaysExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />

                          <TouchableOpacity onPress={() => setBirthdayDismissed(true)} style={{ padding: 4, marginLeft: 10, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 8 }}>

                              <MaterialCommunityIcons name="close" size={14} color={theme.textSecondary} />

                          </TouchableOpacity>

                      </TouchableOpacity>



                      {isBirthdaysExpanded && (

                          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', gap: 8 }}>

                              {birthdays.map((b, index) => (

                                  <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>

                                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: 'bold' }}>{b.name}</Text>

                                      <Text style={{

                                          color: b.daysUntil === 0 ? (theme.isDark ? '#000' : '#FFF') : theme.textSecondary,

                                          fontSize: 11, fontWeight: '900',

                                          backgroundColor: b.daysUntil === 0 ? theme.accent : 'transparent',

                                          paddingHorizontal: b.daysUntil === 0 ? 8 : 0,

                                          paddingVertical:   b.daysUntil === 0 ? 4 : 0,

                                          borderRadius: 6, overflow: 'hidden',

                                      }}>

                                          {b.daysUntil === 0 ? 'HOJE 🎉' : `Em ${b.daysUntil} dias`}

                                      </Text>

                                  </View>

                              ))}

                          </View>

                      )}

                  </View>

              )}



              {/* PENDING COACHES — só para masters */}

              {isMaster && activeTab === 'ALUNOS' && (

                  <PendingCoachesPanel theme={theme} refreshTrigger={coachCheckTrigger} />

              )}



              {/* ONBOARDING — só para coaches parceiros ← v2 */}

              {!isMaster && (

                  <CoachOnboarding

                      theme={theme}

                      navigation={navigation}

                      setActiveTab={setActiveTab}

                      setSubTabGestao={setSubTabGestao}

                  />

              )}



              <AdminNavigation

                  theme={theme} isWebPC={isWebPC} activeTab={activeTab} setActiveTab={setActiveTab}

                  totalAlerts={totalAlerts} MENU_TABS={MENU_TABS} isMenuVisible={isMenuVisible} setIsMenuVisible={setIsMenuVisible}

              />



              {/* FILTRO PAULO / ADRI */}

              {isMaster && activeTab !== 'GESTAO' && (

                  <View style={[styles.segmentedControl, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>

                      <TouchableOpacity style={[styles.segmentBtn, coachFilter === ownerKey && { backgroundColor: theme.surface, shadowColor: theme.isDark ? 'transparent' : '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2, borderWidth: 1, borderColor: theme.isDark ? theme.border : 'transparent' }]} onPress={() => setCoachFilter(ownerKey)}>

                          <Text style={[styles.segmentText, { color: coachFilter === ownerKey ? theme.text : theme.textSecondary }]}>MEUS ALUNOS</Text>

                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.segmentBtn, coachFilter === partnerKey && { backgroundColor: theme.surface, shadowColor: theme.isDark ? 'transparent' : '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2, borderWidth: 1, borderColor: theme.isDark ? theme.border : 'transparent' }]} onPress={() => setCoachFilter(partnerKey)}>

                          <Text style={[styles.segmentText, { color: coachFilter === partnerKey ? theme.text : theme.textSecondary }]}>ALUNOS {partnerKey}</Text>

                      </TouchableOpacity>

                  </View>

              )}



              {loading ? (

                  <View style={{ marginTop: 50 }}><ActivityIndicator size="large" color={theme.accent} /></View>

              ) : (

                  <View style={{ width: '100%' }}>



                      {activeTab === 'ALUNOS' && (

                          <TabAlunos

                              theme={theme} navigation={navigation} search={search} setSearch={setSearch}

                              setFilterModalVisible={setFilterModalVisible} activeFiltersCount={activeFiltersCount}

                              subTabAlunos={subTabAlunos} switchSubTab={switchSubTab} displayList={displayList}

                              visibleCount={visibleCount} setVisibleCount={setVisibleCount}

                              setInviteModalVisible={setInviteModalVisible}

                          />

                      )}



                      {activeTab === 'CHECKINS' && (

                          <TabCheckins

                              theme={theme} subTabCheckins={subTabCheckins} setSubTabCheckins={setSubTabCheckins}

                              filteredCheckins={filteredCheckins} filteredDiet={filteredDiet} filteredSurveys={filteredSurveys}

                              visibleCountCheckins={visibleCountCheckins} setVisibleCountCheckins={setVisibleCountCheckins}

                              visibleCountDiet={visibleCountDiet} setVisibleCountDiet={setVisibleCountDiet}

                              visibleCountSurveys={visibleCountSurveys} setVisibleCountSurveys={setVisibleCountSurveys}

                              coachFilter={coachFilter} isAdriLogged={isAdriLogged}

                              setSelectedCheckin={setSelectedCheckin} setCheckinModalVisible={setCheckinModalVisible}

                              handleMarkFeedbackRead={handleMarkFeedbackRead} handleDeleteFeedback={handleDeleteFeedback}

                              handleMarkSurveyRead={handleMarkSurveyRead}

                          />

                      )}



                      {activeTab === 'FEED' && (

                          <TabFeed

                              theme={theme} filteredFeed={filteredFeed}

                              visibleCountFeed={visibleCountFeed} setVisibleCountFeed={setVisibleCountFeed}

                              handleDeleteLog={handleDeleteLog}

                              navigation={navigation} alunosAtivos={alunosAtivos} alunosInativos={alunosInativos}

                          />

                      )}



                      {activeTab === 'FINANCAS' && (

                          <View style={{ marginHorizontal: -20, marginTop: -10 }}>

                              <AdminFinanceSystem

                                  theme={theme}

                                  alunos={alunosAtivos}

                                  coachFilter={coachFilter}

                                  getLogCoach={getLogCoach}

                                  isWeb={isWebPC}

                                  adminId={adminId}

                              />

                          </View>

                      )}



                      {activeTab === 'GESTAO' && (

                          <TabGestao

                              theme={theme} subTabGestao={subTabGestao} setSubTabGestao={setSubTabGestao}

                              navigation={navigation} alunosAtivos={alunosAtivos}

                              setIsNpsModalOpen={setIsNpsModalOpen} setIsNoticeModalOpen={setIsNoticeModalOpen}

                              toggleDarkMode={toggleDarkMode} selectThemeColor={selectThemeColor}

                              selectedColor={selectedColor}

                          />

                      )}



                  </View>

              )}

          </View>

      </ScrollView>



      <AdminFilterWizard

          theme={theme} filterModalVisible={filterModalVisible} setFilterModalVisible={setFilterModalVisible}

          filterStep={filterStep} setFilterStep={setFilterStep}

          filterStatus={filterStatus} setFilterStatus={setFilterStatus}

          filterIntensidade={filterIntensidade} setFilterIntensidade={setFilterIntensidade}

          filterPlano={filterPlano} setFilterPlano={setFilterPlano}

          OPT_STATUS={OPT_STATUS} OPT_INTENSIDADE={OPT_INTENSIDADE} OPT_PLANOS={OPT_PLANOS}

      />



      <AdminCheckinModal

          visible={checkinModalVisible} onClose={() => setCheckinModalVisible(false)}

          selectedCheckin={selectedCheckin} theme={theme}

          isResolving={isResolving} onResolve={handleResolveCheckin}

      />



      <DisparoNPSModal

          visible={isNpsModalOpen} onClose={() => setIsNpsModalOpen(false)}

          alunos={alunosAtivos} theme={theme}

      />



      <AdminInviteModal

          visible={inviteModalVisible} onClose={() => setInviteModalVisible(false)}

          adminEmail={adminEmail} theme={theme}

      />



      <SendNoticeModal

          visible={isNoticeModalOpen} onClose={() => setIsNoticeModalOpen(false)}

          alunos={alunosAtivos} adminId={adminId} theme={theme}

      />



      {/* ELITE ASSISTANT ← v2 */}

      <EliteAssistant theme={theme} />



    </RootComponent>

  );

}



const styles = StyleSheet.create({

  bannerBtn:          { width: 40, height: 40, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  segmentedControl:   { flexDirection: 'row', marginBottom: 20, padding: 4, borderRadius: 12 },

  segmentBtn:         { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  segmentText:        { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  miniBirthdayPill:   { flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, marginBottom: 16 },

  miniBirthdayText:   { fontSize: 11, fontWeight: '700' },

});
// useEvolutionData de mentira: o usuário vem de globalThis.__evo.userData
exports.useEvolutionData = () => { const s = globalThis.__evo || {}; return { loading: false, setLoading() {}, userData: s.userData, workoutHistory: [], assessmentHistory: [], checkinHistory: [], currentAge: '', setCurrentAge() {}, currentGender: '', setCurrentGender() {}, loadData() {}, historicoDeCargasList: [] }; };

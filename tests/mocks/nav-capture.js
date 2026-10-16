const React = require('react');
exports.useFocusEffect = (cb) => { React.useEffect(() => { const c = cb(); return typeof c === 'function' ? c : undefined; }, [cb]); };
exports.useNavigation = () => ({ navigate() {}, goBack() {} }); exports.useRoute = () => ({ params: {} });
exports.useNavigation = () => ({ navigate: (...a) => { (globalThis.__navs = globalThis.__navs || []).push(a); }, goBack() {}, setParams() {} });

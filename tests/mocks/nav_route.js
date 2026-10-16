const React = require('react');
exports.useFocusEffect = (cb) => { React.useEffect(() => { const c = cb(); return typeof c === 'function' ? c : undefined; }, [cb]); };
exports.useNavigation = () => ({ navigate: (...a) => { (globalThis.__navs = globalThis.__navs || []).push(a); }, goBack() { globalThis.__backs = (globalThis.__backs || 0) + 1; }, canGoBack: () => true, setParams() {} });
exports.useRoute = () => ({ params: globalThis.__route || {} });

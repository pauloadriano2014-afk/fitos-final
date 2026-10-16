const React = require('react');
exports.useFocusEffect = (cb) => { React.useEffect(() => { const c = cb(); return typeof c === 'function' ? c : undefined; }, [cb]); };
exports.useNavigation = () => ({ navigate() {}, goBack() {} }); exports.useRoute = () => ({ params: {} });

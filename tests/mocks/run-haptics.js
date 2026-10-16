globalThis.__buzz = globalThis.__buzz || [];
module.exports = { impactAsync: async (s) => { globalThis.__buzz.push('impact:' + s); }, notificationAsync: async (s) => { globalThis.__buzz.push('notif:' + s); }, selectionAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' }, NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' } };
module.exports.default = module.exports;

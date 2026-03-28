// Minimal mock for expo-notifications (only notification-handler.ts uses it)
module.exports = {
  setNotificationHandler: () => {},
  scheduleNotificationAsync: async () => 'mock-id',
  getPermissionsAsync: async () => ({ status: 'granted', expires: 'never', granted: true, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ status: 'granted', expires: 'never', granted: true, canAskAgain: true }),
};

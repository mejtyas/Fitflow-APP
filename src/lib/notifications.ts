import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

export async function prepareRestNotifications() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android' && !channelReady) {
    await Notifications.setNotificationChannelAsync('rest-timers', {
      name: 'Rest timers',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250],
    });
    channelReady = true;
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleRestCompleteNotification(seconds: number) {
  const granted = await prepareRestNotifications();
  if (!granted || seconds <= 0) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rest complete',
      body: 'Time for your next set.',
      sound: 'default',
      data: { kind: 'fitflow-rest-complete' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.ceil(seconds)),
      repeats: false,
      channelId: Platform.OS === 'android' ? 'rest-timers' : undefined,
    },
  });
}

export async function cancelRestNotification(identifier: string | null) {
  if (!identifier || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
}

export async function signalRestComplete() {
  if (Platform.OS !== 'web') {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }
}

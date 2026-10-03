import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const KIND = 'safespend.tax-check-in';
type Reminder = { id: string; date: string; form: string };

async function current(userId: string, year: number) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter(item => item.content.data?.kind === KIND &&
    item.content.data?.userId === userId && item.content.data?.year === year);
}

export async function taxCheckIn(userId: string, year: number): Promise<Reminder | null> {
  if (Platform.OS === 'web') return null;
  const items = await current(userId, year);
  const item = items[0];
  if (!item) return null;
  return { id: item.identifier, date: String(item.content.data?.date ?? ''), form: String(item.content.data?.form ?? '') };
}

export async function removeTaxCheckIn(userId: string, year: number) {
  if (Platform.OS === 'web') return;
  await Promise.all((await current(userId, year))
    .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

// A personal preparation check-in, not a representation of HASiL's deadline.
// It is local to this device and intentionally contains no tax amounts.
export async function scheduleTaxCheckIn(userId: string, year: number, form: string, day: Date) {
  if (Platform.OS === 'web') throw new Error('Reminders are available in the mobile app.');
  const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
  if (date.getTime() <= Date.now()) throw new Error('Choose a future date for your check-in.');
  const permission = await Notifications.getPermissionsAsync();
  const status = permission.granted ? permission.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Allow notifications in your device settings to set a check-in.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('tax-check-ins', {
    name: 'Tax preparation check-ins', importance: Notifications.AndroidImportance.DEFAULT,
  });
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  // Schedule first: a failure must not silently discard an existing reminder.
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'SafeSpend tax check-in',
      body: 'Review your tax filing preparation and check the current HASiL guidance.',
      data: { kind: KIND, userId, year, form, date: dateKey },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'tax-check-ins' },
  });
  try {
    const previous = await current(userId, year);
    await Promise.all(previous.filter(item => item.identifier !== id)
      .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  } catch (error) {
    try { await Notifications.cancelScheduledNotificationAsync(id); }
    catch { throw new Error('Could not reconcile check-ins. Review scheduled notifications in your device settings.'); }
    throw error;
  }
  return { id, date: dateKey, form };
}

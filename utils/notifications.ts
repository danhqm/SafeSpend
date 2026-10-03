import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// This tells the app how to handle notifications when the app is running in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const SMART_MESSAGES = [
  "Did you buy anything today? Scan your receipt to track it! 📸",
  "LHDN Tip: Keep track of your lifestyle purchases to maximize your tax relief. 💰",
  "Remember to review your daily spending to stay on budget! 📊",
  "Don't let your receipts fade! Scan them into your vault now. 🏦",
  "Have a financial question? Ask Fin for some budgeting advice! 🤖",
  "A penny saved is a penny earned. Check your progress today! 📈",
];

export async function setupSmartNotifications() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Notification permission not granted!");
    return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00D09E",
    });
  }

  // Leave user-chosen tax check-ins and any other app reminders intact.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter(item => item.content.data?.kind === "safespend.smart" ||
    (item.content.title === "SafeSpend" && SMART_MESSAGES.includes(item.content.body ?? "")))
    .map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));

  for (let i = 1; i <= 7; i++) {
    const randomMsg =
      SMART_MESSAGES[Math.floor(Math.random() * SMART_MESSAGES.length)];

    const triggerDate = new Date();
    triggerDate.setDate(triggerDate.getDate() + i);
    triggerDate.setHours(20, 0, 0, 0);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "SafeSpend",
        body: randomMsg,
        sound: true,
        data: { kind: "safespend.smart" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: "default",
      },
    });
  }
}

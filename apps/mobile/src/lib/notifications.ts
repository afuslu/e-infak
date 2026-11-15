import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { apiFetch } from './api'

const FRIDAY_REMINDER_KEY = 'einfak_friday_reminder_id'

export function initNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId
  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  )
  const token = tokenRes.data
  if (token) {
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'expo'
    await apiFetch('/mobile/device-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }).catch(() => {})
  }
  return token
}

export async function isFridayReminderEnabled(): Promise<boolean> {
  const id = await SecureStore.getItemAsync(FRIDAY_REMINDER_KEY)
  return Boolean(id)
}

export async function toggleFridayReminder(enable: boolean): Promise<boolean> {
  const existingId = await SecureStore.getItemAsync(FRIDAY_REMINDER_KEY)
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {})
    await SecureStore.deleteItemAsync(FRIDAY_REMINDER_KEY)
  }
  if (!enable) return false

  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Hayırlı Cumalar',
      body: 'Bugün bir sadaka veya yetim bağışı ile gönüllere dokunabilirsiniz.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 6, // Friday in Expo (1=Sunday .. 7=Saturday)
      hour: 11,
      minute: 0,
    },
  })
  await SecureStore.setItemAsync(FRIDAY_REMINDER_KEY, id)
  return true
}

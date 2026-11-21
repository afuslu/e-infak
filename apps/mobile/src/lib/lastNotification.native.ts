import * as Notifications from 'expo-notifications';

/** Dokunulan son bildirim (uygulama kapalıyken açılanlar dahil). */
export function useLastNotificationData(): { id: string; data: Record<string, any> | undefined } | null {
  const last = Notifications.useLastNotificationResponse();
  if (!last) return null;
  return { id: last.notification.request.identifier, data: last.notification.request.content.data as Record<string, any> | undefined };
}

import * as Notifications from 'expo-notifications';

/** Dokunulan son bildirim (uygulama kapalıyken açılanlar ve etkileşimli aksiyon butonları dahil). */
export function useLastNotificationData(): {
  id: string;
  data: Record<string, any> | undefined;
  actionId?: string;
} | null {
  const last = Notifications.useLastNotificationResponse();
  if (!last) return null;
  return {
    id: `${last.notification.request.identifier}:${last.actionIdentifier}`,
    data: last.notification.request.content.data as Record<string, any> | undefined,
    actionId: last.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? undefined : last.actionIdentifier,
  };
}

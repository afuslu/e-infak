/** Web önizlemesi: push yoktur. Telefonda lastNotification.native.ts kullanılır. */
export function useLastNotificationData(): {
  id: string;
  data: Record<string, any> | undefined;
  actionId?: string;
} | null {
  return null;
}

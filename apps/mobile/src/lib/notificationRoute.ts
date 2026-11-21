import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/** Bildirimin verisine göre açılacak ekran (push'a dokununca ve bildirim kutusunda). */
export function openNotificationTarget(router: Router, data: Record<string, any> | undefined) {
  if (!data) return router.push('/bildirimler');
  switch (data.route) {
    case 'donation':
      if (data.donation_id) return router.push({ pathname: '/bagis/[id]', params: { id: data.donation_id, no: data.receipt_number || '' } });
      break;
    case 'donor':
      if (data.donor_id) return router.push({ pathname: '/bagisci/[id]', params: { id: data.donor_id } });
      break;
    case 'transfers':
      return router.push('/havaleler');
    case 'inflow':
      return router.push('/para-girisleri');
  }
  if (data.type === 'task' || data.task_id) return router.push('/gorevler');
  return router.push('/bildirimler');
}

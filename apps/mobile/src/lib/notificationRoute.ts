import type { Href, useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/** Bildirimin verisine veya aksiyon butonuna göre açılacak ekran. */
export function openNotificationTarget(
  router: Router,
  data: Record<string, any> | undefined,
  actionId?: string
) {
  if (actionId === 'open_receipt') return router.push('/makbuz-kes');
  if (actionId === 'open_transfers') return router.push('/havaleler');
  if (actionId === 'open_tasks') {
    return data?.task_id
      ? router.push({ pathname: '/gorevler/[id]', params: { id: data.task_id } })
      : router.push('/gorevler');
  }
  if (actionId === 'open_donation' && data?.donation_id) {
    return router.push({
      pathname: '/bagis/[id]',
      params: { id: data.donation_id, no: data.receipt_number || '' },
    });
  }

  if (!data) return router.push('/bildirimler');
  switch (data.route) {
    case 'donation':
      if (data.donation_id) {
        return router.push({
          pathname: '/bagis/[id]',
          params: { id: data.donation_id, no: data.receipt_number || '' },
        });
      }
      break;
    case 'donor':
      if (data.donor_id) return router.push({ pathname: '/bagisci/[id]', params: { id: data.donor_id } });
      break;
    case 'failed_payments':
      return router.push((data.order_id ? `/basarisiz-odemeler?order_id=${data.order_id}` : '/basarisiz-odemeler') as Href);
    case 'transfers':
      return router.push('/havaleler');
    case 'inflow':
      return router.push('/para-girisleri');
    case 'campaign':
      return router.push('/kampanyalar');
    case 'money_box':
      return data.money_box_id
        ? router.push({ pathname: '/kumbara/[id]', params: { id: data.money_box_id } })
        : router.push('/kumbara');
    case 'recurring':
      return router.push('/duzenli-odemeler');
    case 'kurban':
      return router.push('/kurban' as Href);
    case 'well':
      return router.push('/su-kuyusu' as Href);
    case 'needy':
      return router.push('/yoksul-takip' as Href);
    case 'search':
      return router.push('/arama' as Href);
  }
  if (data.type === 'task' || data.task_id) {
    return data.task_id
      ? router.push({ pathname: '/gorevler/[id]', params: { id: data.task_id } })
      : router.push('/gorevler');
  }
  return router.push('/bildirimler');
}

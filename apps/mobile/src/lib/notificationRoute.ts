import type { Href, useRouter } from 'expo-router';
import type { PushScope } from './notifications';

type Router = ReturnType<typeof useRouter>;

/** Bildirimin verisine, aksiyon butonuna ve oturum kapsamına göre açılacak ekran. */
export function openNotificationTarget(
  router: Router,
  data: Record<string, any> | undefined,
  actionId?: string,
  scope: PushScope = 'tenant',
) {
  if (scope === 'donor') {
    switch (data?.route) {
      case 'donor_donations':
        return router.push('/(donor)/bagislarim' as Href);
      case 'donor_kurban':
        return router.push('/(donor)/projelerim' as Href);
      case 'donor_wells':
        return router.push('/(donor)/su-kuyularim' as Href);
      case 'donor_subscriptions':
        return router.push('/(donor)/talimatlarim' as Href);
      case 'donor_sponsorships':
        return router.push('/(donor)/ustlendiklerim' as Href);
      default:
        return router.push('/(donor)' as Href);
    }
  }

  if (scope === 'platform') {
    switch (data?.route) {
      case 'platform_ticket':
        return data?.ticket_id
          ? router.push({ pathname: '/talep/[id]', params: { id: data.ticket_id } } as unknown as Href)
          : router.push('/(tabs)/talepler' as Href);
      case 'platform_tickets':
        return router.push('/(tabs)/talepler' as Href);
      case 'platform_demos':
        return router.push({ pathname: '/(tabs)/talepler', params: { tab: 'demos' } } as unknown as Href);
      case 'platform_org':
        return data?.org_id
          ? router.push({ pathname: '/kurum/[id]', params: { id: data.org_id } } as unknown as Href)
          : router.push('/(tabs)/kurumlar' as Href);
      default:
        return router.push('/(tabs)/talepler' as Href);
    }
  }

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
  // Hatırlatma: bağışçı varsa kartı, yoksa Hatırlatıcı (sunucu route=search gönderse de).
  if (data.type === 'reminder') {
    return data.donor_id
      ? router.push({ pathname: '/bagisci/[id]', params: { id: data.donor_id } })
      : router.push('/hatirlatici' as Href);
  }
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

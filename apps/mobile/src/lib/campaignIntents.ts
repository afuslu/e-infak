/** Kurban intentions ("niyet") staff can pick for a campaign when they write a receipt. */

export interface IntentCampaign {
  category?: string | null;
  campaign_type?: string;
  donation_options?: { intents?: string[] } | null;
  checkout_fields_schema?: { key?: string; options?: string[] }[] | null;
  type_details?: Record<string, unknown> | null;
}

export interface CampaignIntents {
  options: string[];
  /** Preselected intention; '' = staff chooses. */
  initial: string;
  /** The campaign itself asks for an intention. */
  required: boolean;
}

export const KURBAN_INTENTS: Record<string, string> = {
  vacip: 'Vacip', adak: 'Adak', akika: 'Akika', sukur: 'Şükür', nafile: 'Nafile', sadaka: 'Sadaka', sifa: 'Şifa',
};

/** The organisation's own choices come first; a kurban campaign without any offers the standard ones. */
export function campaignIntents(campaign?: IntentCampaign | null): CampaignIntents | null {
  if (!campaign) return null;
  const fields = campaign.checkout_fields_schema || [];
  const own = [campaign.donation_options?.intents, fields.find((f) => f.key === 'niyet')?.options,
    fields.find((f) => f.key === 'kurban_type')?.options].find((o) => o?.length);
  const type = KURBAN_INTENTS[String(campaign.type_details?.kurban_type || '')] || '';
  const kurban = Boolean(type) || campaign.campaign_type === 'kurban'
    || ['kurban', 'adak', 'akika'].includes(campaign.category || '');
  if (!own && !kurban) return null;
  const options = own || Object.values(KURBAN_INTENTS);
  return {
    options,
    initial: options.includes(type) ? type : own?.length === 1 ? own[0] : '',
    required: Boolean(own),
  };
}

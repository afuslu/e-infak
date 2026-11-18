'use client'

import { dateTr } from '../../lib/platform-api'

export interface AuditEntry {
  id: string; action: string; operator: string | null; organization: string | null
  details: Record<string, unknown> | null; ip: string | null; created_at: string
}

/** Readable labels for platform audit actions; unknown ones fall back to the raw name. */
export const ACTION_LABELS: Record<string, string> = {
  platform_giris: 'Platform girişi',
  platform_giris_basarisiz: 'Başarısız platform girişi',
  platform_sifre_degisti: 'Platform şifresi değişti',
  kurum_olustur: 'Kurum oluşturuldu',
  kurum_guncelle: 'Kurum güncellendi',
  kurum_askiya_al: 'Kurum askıya alındı',
  kurum_aktif_et: 'Kurum aktif edildi',
  kullanici_olustur: 'Kullanıcı eklendi',
  kullanici_guncelle: 'Kullanıcı güncellendi',
  kullanici_sifre_sifirla: 'Kullanıcı şifresi sıfırlandı',
  destek_girisi: 'Destek girişi',
  demo_talebi_durum: 'Demo talebi durumu',
  demo_talebi_silindi: 'Demo talebi silindi',
  abonelik_guncellendi: 'Abonelik güncellendi',
  abonelik_tahsilati: 'Abonelik tahsilatı',
  operator_eklendi: 'Operatör eklendi',
  operator_guncellendi: 'Operatör güncellendi',
  operator_sifre_sifirlandi: 'Operatör şifresi sıfırlandı',
  sistem_duyurusu_eklendi: 'Sistem duyurusu eklendi',
  sistem_duyurusu_guncellendi: 'Sistem duyurusu güncellendi',
  sistem_duyurusu_silindi: 'Sistem duyurusu silindi',
  uyari_gizlendi: 'Uyarı gizlendi',
  kurum_silindi: 'Kurum silindi',
  abonelik_hatirlatmasi: 'Abonelik hatırlatması gönderildi',
  test_sms_gonderildi: 'Test SMS gönderildi',
}

const actionLabel = (action: string) => ACTION_LABELS[action] || action.replace(/_/g, ' ')

function show(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'evet' : 'hayır'
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('old' in v && 'new' in v) return `${show(v.old)} → ${show(v.new)}`
    return Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join(', ')
  }
  return String(value)
}

export function AuditTable({ rows, showOrganization = true }: { rows: AuditEntry[]; showOrganization?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="p-3">Zaman</th><th className="p-3">İşlem</th>
            {showOrganization && <th className="p-3">Kurum</th>}
            <th className="p-3">Yönetici</th><th className="p-3">Ayrıntı</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="whitespace-nowrap p-3 text-xs">{dateTr(r.created_at)}</td>
              <td className="p-3 font-semibold">{actionLabel(r.action)}</td>
              {showOrganization && <td className="p-3">{r.organization || '—'}</td>}
              <td className="p-3 text-xs">{r.operator || '—'}<div className="text-slate-400">{r.ip}</div></td>
              <td className="p-3 text-xs text-slate-600">
                {Object.entries(r.details || {}).map(([key, value]) => (
                  <div key={key}><span className="text-slate-400">{key}:</span> {show(value)}</div>
                ))}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={showOrganization ? 5 : 4} className="p-6 text-center text-slate-500">Kayıt yok</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

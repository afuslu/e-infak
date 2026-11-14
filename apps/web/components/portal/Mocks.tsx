import type { ReactNode } from 'react'
import { ArrowDownToLine, Check, CheckCircle2, GripVertical, HandCoins, MessageSquareText, TrendingUp, Users } from 'lucide-react'

/**
 * Small replicas of real panel screens for the landing page. They are drawn in HTML so they are
 * sharp on every screen and follow the day / night theme. All names and figures are made up.
 */

export function Frame({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-2xl border border-pt-line bg-pt-card pt-shadow ${className}`}>
      <div className="flex items-center gap-2 border-b border-pt-line bg-pt-soft px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" />
        <span className="ml-2 truncate text-[11px] font-semibold text-pt-faint">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

const label = 'text-[10px] font-bold uppercase tracking-wide text-pt-faint'
const pill = 'rounded-full px-2 py-0.5 text-[10px] font-bold'

export function MockDashboard() {
  const bars = [42, 55, 48, 71, 63, 88]
  const months = ['Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas']
  return (
    <Frame title="panel · Genel Bakış">
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-600">
        <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />
        <span className="text-pt-text">12 gelen havale bağışçıyla eşleştirilmeyi bekliyor</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {([['Bugün', '18.450 ₺', HandCoins], ['Bu ay', '412.300 ₺', TrendingUp], ['Bağışçı', '2.184', Users]] as const).map(([name, value, Icon]) => (
          <div key={name} className="rounded-xl border border-pt-line bg-pt-bg p-3">
            <div className="flex items-center justify-between"><span className={label}>{name}</span><Icon className="h-3.5 w-3.5 text-pt-faint" /></div>
            <div className="mt-1 text-base font-black tabular-nums text-pt-text sm:text-lg">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-pt-line bg-pt-bg p-3">
        <div className="mb-2 text-[11px] font-bold text-pt-text">Aylık bağış trendi</div>
        <div className="flex h-28 items-end gap-2">
          {bars.map((height, index) => (
            <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t-md bg-pt-brand" style={{ height: `${height}%`, opacity: 0.45 + index * 0.11 }} />
              <span className="text-[9px] font-semibold text-pt-faint">{months[index]}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  )
}

export function MockTransfer() {
  return (
    <Frame title="panel · Gelen Havaleler">
      <div className="rounded-xl border border-pt-line bg-pt-bg p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-pt-text">AYŞE DEMİR</div>
            <div className="truncate text-[11px] text-pt-muted">Gönderen: AYŞE DEMİR · su kuyusu ve yetim 0532…</div>
          </div>
          <div className="whitespace-nowrap font-mono text-sm font-bold text-pt-text">1.000,00 ₺</div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`${pill} bg-pt-brand-soft text-pt-brand`}>Bağışçı: kesin</span>
          <span className="text-[11px] font-semibold text-pt-text">Ayşe Demir</span>
          <span className="text-[10px] text-pt-faint">açıklamadaki telefondan</span>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-pt-line p-3">
        <div className={`${label} mb-2`}>Makbuz kalemleri</div>
        {[['Su Kuyusu Projesi', '600,00'], ['Yetim Eğitim Desteği', '400,00']].map(([name, amount]) => (
          <div key={name} className="mb-1.5 flex items-center gap-2">
            <div className="flex-1 truncate rounded-lg border border-pt-line bg-pt-bg px-2.5 py-1.5 text-[11px] font-semibold text-pt-text">{name}</div>
            <div className="w-20 rounded-lg border border-pt-line bg-pt-bg px-2.5 py-1.5 text-right font-mono text-[11px] text-pt-text">{amount}</div>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-bold text-pt-brand">
          <Check className="h-3.5 w-3.5" /> Toplam 1.000,00 / 1.000,00 ₺
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-pt-muted"><MessageSquareText className="h-3.5 w-3.5" /> Makbuz SMS&apos;i hazır</span>
        <span className="pt-cta rounded-lg px-3 py-1.5 text-[11px] font-bold">Bağışı kaydet</span>
      </div>
    </Frame>
  )
}

export function MockSms() {
  return (
    <Frame title="panel · Hızlı SMS Gönder — Makbuz">
      <div className={`${label} mb-1`}>Şablon</div>
      <div className="rounded-lg border border-pt-line bg-pt-bg px-2.5 py-2 text-[11px] font-semibold text-pt-text">Makbuz SMS</div>
      <div className={`${label} mb-1 mt-3`}>Mesaj metni</div>
      <div className="rounded-lg border border-pt-line bg-pt-bg p-2.5 text-[12px] leading-relaxed text-pt-text">
        Değerli bağışçımız, <strong>1.000,00 TL</strong> bağışınız derneğimize ulaşmıştır. Allah kabul etsin.<br />Örnek Derneği
      </div>
      <div className="mt-1.5 text-[10px] font-semibold text-pt-faint">104 karakter · 1 SMS · Türkçe karakter</div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-pt-line px-2.5 py-2">
        <span className="text-[11px] text-pt-muted">İleri tarihli gönder</span>
        <span className="h-4 w-7 rounded-full bg-pt-line"><span className="block h-4 w-4 rounded-full border border-pt-line bg-pt-card" /></span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-pt-brand-soft px-3 py-2 text-[11px] font-semibold text-pt-brand">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> SMS kuyruğa alındı #316 — İletildi
      </div>
    </Frame>
  )
}

export function MockBulk() {
  return (
    <Frame title="panel · Toplu SMS Gönder">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-pt-line bg-pt-bg p-3"><div className={label}>Alıcı</div><div className="text-lg font-black tabular-nums text-pt-text">1.842</div></div>
        <div className="rounded-xl border border-pt-line bg-pt-bg p-3"><div className={label}>Toplam SMS</div><div className="text-lg font-black tabular-nums text-pt-text">1.842</div></div>
      </div>
      <p className="mt-2 text-[11px] text-pt-muted">Son 6 ayda bağış yapanlar: 2.031 kayıt. Dışarıda kalan 189: 121 izinsiz, 44 telefonsuz, 24 tekrar eden.</p>
      <div className={`${label} mb-1 mt-3`}>İlk alıcıya gidecek ileti</div>
      <div className="rounded-2xl rounded-bl-sm bg-pt-soft p-3 text-[12px] leading-relaxed text-pt-text">Sayın Mehmet Kaya, hayırlı kandiller dileriz. Örnek Derneği</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['Etikete göre', 'Şehre göre', 'Kurban bağışçıları', 'Aidatı gecikenler'].map((chip) => (
          <span key={chip} className="rounded-full border border-pt-line px-2 py-0.5 text-[10px] font-semibold text-pt-muted">{chip}</span>
        ))}
      </div>
    </Frame>
  )
}

export function MockBuilder() {
  return (
    <Frame title="panel · Site Yapıcı">
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 space-y-1.5">
          {['Slider', 'Bağış kartları', 'Sayılarla biz', 'Kurban hisse', 'Haberler'].map((block, index) => (
            <div key={block} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${index === 1 ? 'border-pt-brand bg-pt-brand-soft text-pt-brand' : 'border-pt-line bg-pt-bg text-pt-text'}`}>
              <GripVertical className="h-3 w-3 text-pt-faint" />{block}
            </div>
          ))}
        </div>
        <div className="col-span-3 space-y-2 rounded-xl border border-pt-line bg-pt-bg p-2.5">
          <div className="h-12 rounded-lg bg-pt-brand" style={{ opacity: 0.85 }} />
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((card) => (
              <div key={card} className="rounded-lg border border-pt-line bg-pt-card p-1.5">
                <div className="mb-1 h-6 rounded bg-pt-soft" />
                <div className="h-1.5 w-3/4 rounded bg-pt-line" />
                <div className="mt-1 h-3 rounded bg-pt-brand-soft" />
              </div>
            ))}
          </div>
          <div className="h-1.5 w-1/2 rounded bg-pt-line" /><div className="h-1.5 w-2/3 rounded bg-pt-line" />
        </div>
      </div>
    </Frame>
  )
}

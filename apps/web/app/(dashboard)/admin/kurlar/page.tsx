'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Clock, Coins, DollarSign, Euro, RefreshCw, Search } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, useAdminAccess, can } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader, GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { EmptyState, TBody, THead, Table, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Rates {
  currencies: { code: string; name: string; rate: number; fetched_at: string }[]
  gold: { name: string; price: number }[]
  gold_updated_at: string | null
}

const tl = (value: number, maxDigits = 4) =>
  value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits })

/** e-Infak "Döviz Kurları": rates used for foreign-currency donations and zakat. */
export default function RatesPage() {
  const { data: access } = useAdminAccess()
  const [rates, setRates] = useState<Rates | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [amount, setAmount] = useState('100')
  const [selectedUnit, setSelectedUnit] = useState('USD')
  const [toTry, setToTry] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<Rates>('/exchange-rates')
      setRates(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kurlar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = async () => {
    setBusy(true)
    try {
      const res = await adminSend<Rates>('post', '/exchange-rates/refresh')
      setRates(res.data)
      toast.ok('Kurlar güncellendi')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kurlar güncellenemedi'))
    } finally {
      setBusy(false)
    }
  }

  const usd = rates?.currencies.find((c) => c.code === 'USD')
  const eur = rates?.currencies.find((c) => c.code === 'EUR')
  const gramGold = rates?.gold.find((g) => /gram/i.test(g.name)) || rates?.gold[0]
  const lastUpdatedIso = rates?.gold_updated_at || rates?.currencies[0]?.fetched_at || null
  const lastUpdatedText = lastUpdatedIso
    ? new Date(lastUpdatedIso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
    : '—'

  const filteredCurrencies = useMemo(() => {
    const list = rates?.currencies || []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q))
  }, [rates, query])

  const unitOptions = useMemo(() => {
    const curr = (rates?.currencies || []).map((c) => ({ key: c.code, label: `${c.code} — ${c.name}`, price: c.rate }))
    const gold = (rates?.gold || []).map((g) => ({ key: `GOLD:${g.name}`, label: `${g.name} (Altın)`, price: g.price }))
    return [...curr, ...gold]
  }, [rates])

  const activeUnit = unitOptions.find((u) => u.key === selectedUnit) || unitOptions[0]
  const numericAmount = Number(amount.replace(',', '.'))
  const convertedValue =
    activeUnit && Number.isFinite(numericAmount) && numericAmount > 0 && activeUnit.price > 0
      ? toTry
        ? numericAmount * activeUnit.price
        : numericAmount / activeUnit.price
      : null

  const canRefresh = can(access, 'settings.manage') || can(access, 'finance.manage')

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Finans & Bağış Altyapısı"
        title="Döviz ve Altın Kurları"
        meta="Dövizli bağışların TL karşılığı ve zekât hesabı bu kurlarla yapılır. Kaynak: TCMB (saatlik otomatik güncelleme)."
        icon={<Coins className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading || busy}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {canRefresh && (
              <Button type="button" size="sm" onClick={refresh} disabled={busy}>
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                {busy ? 'Güncelleniyor…' : 'Kurları Güncelle'}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlobalStatCard
          title="USD / TRY"
          value={usd ? `${tl(usd.rate)} ₺` : '—'}
          subtitle={usd?.name || 'Amerikan Doları'}
          gradient="from-emerald-500 to-teal-600"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="EUR / TRY"
          value={eur ? `${tl(eur.rate)} ₺` : '—'}
          subtitle={eur?.name || 'Euro'}
          gradient="from-blue-500 to-indigo-600"
          icon={<Euro className="h-4 w-4" />}
        />
        <GlobalStatCard
          title={gramGold?.name || 'Gram Altın'}
          value={gramGold ? `${tl(gramGold.price, 2)} ₺` : '—'}
          subtitle="Saf altın baz fiyatı"
          gradient="from-amber-500 to-orange-600"
          icon={<Coins className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Son Güncelleme"
          value={lastUpdatedText}
          subtitle={`${rates?.currencies.length ?? 0} döviz · ${rates?.gold.length ?? 0} altın`}
          gradient="from-slate-600 to-slate-800"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {unitOptions.length > 0 && (
        <Card className="rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <Label label="Tutar">
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Label>
            </div>
            <div className="min-w-52 flex-1">
              <Label label="Döviz / Altın Birimi">
                <select
                  className={inputClass}
                  value={activeUnit?.key || ''}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                >
                  {unitOptions.map((u) => (
                    <option key={u.key} value={u.key}>
                      {u.label} ({tl(u.price)} ₺)
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setToTry((v) => !v)}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {toTry ? 'Birim → ₺' : '₺ → Birim'}
            </Button>
            <div className="min-w-52 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Hızlı Kur Çevirici Sonucu</p>
              <p className="font-mono text-base font-black text-emerald-950">
                {convertedValue === null
                  ? '—'
                  : toTry
                    ? `${tl(convertedValue, 2)} ₺`
                    : `${tl(convertedValue, 4)} ${activeUnit?.key.replace(/^GOLD:/, '')}`}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900">Döviz Kurları (TCMB)</h2>
            {rates && rates.currencies.length > 0 && (
              <div className="relative w-52">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  placeholder="USD, EUR, SAR ara…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8 text-xs"
                />
              </div>
            )}
          </div>

          {loading && !rates ? (
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : !rates || rates.currencies.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="Henüz kur alınmadı"
              text="Sağ üstteki “Kurları Güncelle” butonuyla TCMB kurlarını çekebilirsiniz."
            />
          ) : filteredCurrencies.length === 0 ? (
            <EmptyState icon={Search} title="Para birimi bulunamadı" text="Arama terimini temizleyip tekrar deneyin." />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Para Birimi</Th>
                  <Th className="text-right">1 Birim (₺)</Th>
                  <Th className="text-right">Güncelleme</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredCurrencies.map((c) => (
                  <Tr key={c.code} className="hover:bg-slate-50/70">
                    <Td>
                      <span className="font-semibold text-slate-900">{c.code}</span>{' '}
                      <span className="text-xs text-slate-500">{c.name}</span>
                    </Td>
                    <Td className="text-right font-mono font-semibold text-slate-900">{tl(c.rate)}</Td>
                    <Td className="text-right text-xs text-slate-500">
                      {new Date(c.fetched_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <h2 className="text-base font-black text-slate-900">Altın Fiyatları</h2>
          {loading && !rates ? (
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : !rates || rates.gold.length === 0 ? (
            <EmptyState
              icon={Coins}
              title="Altın fiyatı henüz alınmadı"
              text="Zekât Ayarları üzerinden otomatik güncellemenin açık olduğundan emin olun veya kurları güncelleyin."
            />
          ) : (
            <>
              <Table>
                <THead>
                  <Tr>
                    <Th>Tür</Th>
                    <Th className="text-right">Fiyat (₺)</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rates.gold.map((g) => (
                    <Tr key={g.name} className="hover:bg-slate-50/70">
                      <Td className="font-semibold text-slate-900">{g.name}</Td>
                      <Td className="text-right font-mono font-semibold text-slate-900">{tl(g.price, 2)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <p className="text-xs text-slate-500">
                Çeyrek, yarım, tam, Cumhuriyet ve bilezik fiyatları gram altından saf altın miktarına göre hesaplanır; kuyumcu işçilik farkı içermez.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

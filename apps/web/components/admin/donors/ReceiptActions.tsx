'use client'

/** Receipt corrections on the donor card: remove a receipt with its bank match, move it, merge duplicate cards. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminSend, apiErrorMessage, formatMoney } from '../../../lib/admin-access'
import { DonorPicker, type PickedDonor } from '../DonorPicker'
import { inputClass } from '../FormKit'
import { Modal, toast } from '../ui'
import type { DonorDonation } from './types'

const ghost = 'rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50'
const primary = 'rounded-lg bg-primary-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50'
const danger = 'rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50'

const label = (d: DonorDonation) => `#${d.receipt_number} · ${formatMoney(d.amount_cents, d.currency)}`

export function RemoveReceiptDialog({ donation, onClose, onDone }: {
  donation: DonorDonation; onClose: () => void; onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const title = donation.bank_matched ? 'Makbuz ve Eşleştirme Sil' : 'Makbuzu Sil'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await adminSend<{ transfer_id: string | null }>('post', `/donations/${donation.id}/remove`, { reason: reason.trim() })
      toast.ok(res.data.transfer_id
        ? 'Makbuz iptal edildi; hareket Banka Hareketleri\'nde yeniden eşleşme bekliyor'
        : 'Makbuz iptal edildi')
      onClose()
      onDone()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Makbuz silinemedi'))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} description={label(donation)} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[13px] text-gray-600">
          Makbuz iptal edilir, tutar toplamlardan düşer.
          {donation.bank_matched
            ? ' Banka hareketi “Eşleşmedi” durumuna döner; Banka Hareketleri\'nden doğru bağışçıya yeniden makbuz ekleyebilirsiniz. Havale birden çok kaleme bölündüyse hepsi iptal olur.'
            : ' Bu makbuza bağlı banka hareketi yok. Makbuz yalnızca yanlış karttaysa silmek yerine “Başka karta taşı” kullanın.'}
        </p>
        <label className="block text-xs font-bold text-gray-600">Neden
          <input autoFocus className={`${inputClass} mt-1`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Örn. mükerrer kayıt" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={ghost} onClick={onClose}>Vazgeç</button>
          <button type="submit" className={danger} disabled={busy || reason.trim().length < 3}>{busy ? 'Siliniyor…' : title}</button>
        </div>
      </form>
    </Modal>
  )
}

export function MoveReceiptDialog({ donation, donorId, onClose, onDone }: {
  donation: DonorDonation; donorId: string; onClose: () => void; onDone: () => void
}) {
  const [target, setTarget] = useState<PickedDonor | null>(null)
  const [busy, setBusy] = useState(false)
  const same = target?.id === donorId

  const submit = async () => {
    if (!target) return
    setBusy(true)
    try {
      await adminSend('post', `/donations/${donation.id}/move`, { donor_id: target.id })
      toast.ok(`Makbuz ${target.full_name} kartına taşındı`)
      onClose()
      onDone()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Makbuz taşınamadı'))
      setBusy(false)
    }
  }

  return (
    <Modal title="Makbuzu Başka Karta Taşı" description={label(donation)} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] text-gray-600">Makbuz numarası, tutar ve banka eşleşmesi aynı kalır. Çok kalemli makbuzun tüm kalemleri birlikte taşınır.</p>
        <DonorPicker value={target} onChange={setTarget} label="Doğru bağışçı" />
        {same && <p className="text-[12px] font-semibold text-rose-600">Makbuz zaten bu kartta.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={ghost} onClick={onClose}>Vazgeç</button>
          <button type="button" className={primary} disabled={busy || !target || same} onClick={submit}>{busy ? 'Taşınıyor…' : 'Taşı'}</button>
        </div>
      </div>
    </Modal>
  )
}

export function MergeDonorDialog({ donorId, donorName, onClose }: { donorId: string; donorName: string; onClose: () => void }) {
  const router = useRouter()
  const [target, setTarget] = useState<PickedDonor | null>(null)
  const [busy, setBusy] = useState(false)
  const same = target?.id === donorId

  const submit = async () => {
    if (!target) return
    setBusy(true)
    try {
      await adminSend('post', '/donors/merge', { target_id: target.id, source_ids: [donorId] })
      toast.ok('Kartlar birleştirildi')
      router.push(`/admin/bagiscilar/${target.id}`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kartlar birleştirilemedi'))
      setBusy(false)
    }
  }

  return (
    <Modal title="Kartları Birleştir" description={donorName} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] text-gray-600">
          Bu karttaki tüm makbuz, not ve kayıtlar seçtiğiniz asıl karta taşınır; <strong>bu kart kalıcı olarak silinir</strong>.
          Aynı bağış iki kez kaydedildiyse önce fazla makbuzu silin.
        </p>
        <DonorPicker value={target} onChange={setTarget} label="Kalacak asıl kart" />
        {same && <p className="text-[12px] font-semibold text-rose-600">Farklı bir kart seçin.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={ghost} onClick={onClose}>Vazgeç</button>
          <button type="button" className={danger} disabled={busy || !target || same} onClick={submit}>{busy ? 'Birleştiriliyor…' : 'Birleştir'}</button>
        </div>
      </div>
    </Modal>
  )
}

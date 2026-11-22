'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Send } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage, hasFeature, useAdminAccess, whatsappUrl } from '../../lib/admin-access'
import { ghostButton, inputClass, primaryButton } from './FormKit'
import { Modal, WhatsAppIcon, toast } from './ui'

export interface WhatsAppTarget {
  donorId?: string | null
  name?: string | null
  phone?: string | null
}

interface WaTemplate {
  name: string
  language: string
  category?: string
  body: string
  param_count: number
}

interface WaAccount {
  configured: boolean
  can_list_templates: boolean
}

export function QuickWhatsAppDialog({
  target,
  onClose,
  onSent,
}: {
  target: WhatsAppTarget
  onClose: () => void
  onSent?: () => void
}) {
  const { data: access } = useAdminAccess()
  const waFeature = hasFeature(access, 'whatsapp')
  const [account, setAccount] = useState<WaAccount | null>(null)
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<'template' | 'text'>('template')
  const [templateName, setTemplateName] = useState('')
  const [language, setLanguage] = useState('tr')
  const [params, setParams] = useState<string[]>([])
  const [text, setText] = useState(
    `Merhaba ${target.name || ''}, bağışlarınız ve desteğiniz için teşekkür ederiz.`.replace('  ', ' '),
  )
  const [phone, setPhone] = useState(target.phone || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!waFeature) {
      setLoading(false)
      setAccount({ configured: false, can_list_templates: false })
      return
    }
    let alive = true
    setLoading(true)
    adminGet<WaAccount>('/whatsapp/account')
      .then(async (res) => {
        if (!alive) return
        setAccount(res.data)
        if (res.data.configured && res.data.can_list_templates) {
          try {
            const tplRes = await adminGet<WaTemplate[]>('/whatsapp/templates')
            if (!alive) return
            const list = tplRes.data || []
            setTemplates(list)
            if (list.length > 0) {
              setTemplateName(list[0].name)
              setLanguage(list[0].language || 'tr')
              setParams(Array.from({ length: list[0].param_count || 0 }, (_, i) => (i === 0 ? '{ad}' : '')))
            } else {
              setKind('text')
            }
          } catch {
            if (alive) setKind('text')
          }
        } else if (res.data.configured) {
          setKind('text')
        }
      })
      .catch(() => {
        if (alive) setAccount({ configured: false, can_list_templates: false })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [waFeature])

  const selectedTpl = templates.find((t) => t.name === templateName) || null

  const selectTemplate = (name: string) => {
    setTemplateName(name)
    const tpl = templates.find((t) => t.name === name)
    if (tpl) {
      setLanguage(tpl.language || 'tr')
      setParams(Array.from({ length: tpl.param_count || 0 }, (_, i) => (i === 0 ? '{ad}' : '')))
    }
  }

  const waWebLink = whatsappUrl(phone || target.phone, kind === 'text' ? text : `Merhaba ${target.name || ''}`)

  const sendApi = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!phone.trim()) {
      setError('Telefon numarası gerekli')
      return
    }
    if (kind === 'template' && !templateName.trim()) {
      setError('Bir şablon seçin veya adını yazın')
      return
    }
    if (kind === 'text' && !text.trim()) {
      setError('Mesaj metni boş olamaz')
      return
    }
    setBusy(true)
    try {
      await adminSend('post', '/whatsapp/send', {
        donor_id: target.donorId || undefined,
        phone: phone.trim(),
        kind,
        template_name: kind === 'template' ? templateName.trim() : undefined,
        language: kind === 'template' ? language : undefined,
        params: kind === 'template' ? params : [],
        text: kind === 'text' ? text.trim() : undefined,
      })
      toast.ok('WhatsApp mesajı gönderildi')
      onSent?.()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'WhatsApp mesajı gönderilemedi'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="WhatsApp Mesajı Gönder"
      description={target.name ? `${target.name}${target.phone ? ` · ${target.phone}` : ''}` : undefined}
      onClose={onClose}
    >
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">WhatsApp bağlantısı kontrol ediliyor…</div>
      ) : !account?.configured ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">WhatsApp Business API hesabı henüz tanımlı değil.</p>
            <p className="mt-1 text-xs text-amber-800">
              {waFeature
                ? 'Doğrudan panel üzerinden API ile mesaj göndermek için WhatsApp Business ayarlarını tamamlayabilir ya da aşağıdan WhatsApp Web ile açabilirsiniz.'
                : 'Doğrudan API gönderimi üst paket özelliğidir; aşağıdan WhatsApp Web ile mesaj gönderebilirsiniz.'}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Mesaj (WhatsApp Web)</label>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {waFeature && (
              <Link href="/admin/whatsapp" onClick={onClose} className={ghostButton}>
                WhatsApp API Ayarları
              </Link>
            )}
            <button type="button" onClick={onClose} className={ghostButton}>Kapat</button>
            {waWebLink && (
              <a
                href={waWebLink}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              >
                <WhatsAppIcon className="h-4 w-4" /> WhatsApp Web ile Aç <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={sendApi} className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setKind('template')}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${kind === 'template' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >
              Onaylı Şablon (API)
            </button>
            <button
              type="button"
              onClick={() => setKind('text')}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${kind === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >
              Serbest Mesaj (24s)
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Telefon</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XXX XX XX"
              className={inputClass}
            />
          </div>

          {kind === 'template' ? (
            <div className="space-y-3">
              {templates.length > 0 ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Onaylı Şablon</label>
                  <select
                    value={templateName}
                    onChange={(e) => selectTemplate(e.target.value)}
                    className={inputClass}
                  >
                    {templates.map((t) => (
                      <option key={`${t.name}:${t.language}`} value={t.name}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-gray-700">Şablon Adı</label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="bagis_tesekkur"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700">Dil</label>
                    <input
                      type="text"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {selectedTpl?.body && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs whitespace-pre-wrap text-gray-700">
                  {selectedTpl.body}
                </div>
              )}

              {params.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    Şablon Değişkenleri <span className="font-normal text-gray-400">({'{ad}'}, {'{soyad}'} kullanabilirsiniz)</span>
                  </label>
                  {params.map((val, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={val}
                      onChange={(e) => setParams((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))}
                      placeholder={`Değişken {{${idx + 1}}}`}
                      className={inputClass}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Mesaj Metni <span className="font-normal text-gray-400">(son 24 saatte yazışılan kişiler için)</span>
              </label>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {waWebLink ? (
              <a
                href={waWebLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
              >
                <ExternalLink className="h-3.5 w-3.5" /> WhatsApp Web ile aç
              </a>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={ghostButton}>Vazgeç</button>
              <button type="submit" disabled={busy} className={primaryButton}>
                <Send className="h-4 w-4" /> {busy ? 'Gönderiliyor…' : 'API ile Gönder'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}

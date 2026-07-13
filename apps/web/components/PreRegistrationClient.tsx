'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSendPreRegistration } from '@e-infak/api-client'

const PROGRAMS = [
  { value: 'sibyan', label: 'Sıbyan Mektebi' },
  { value: 'ibtida', label: 'İbtida Programı' },
  { value: 'hafizlik', label: 'Hafızlık Eğitimi' },
  { value: 'arapca', label: 'Arapça Dil Eğitimi' },
]

const PRIMARY = '#1E7A34'
const HOVER = '#166028'
const BORDER = '#E4E9E2'
const BG = '#F0F6EE'
const TEXT = '#6B7A70'
const LABEL = '#3A4540'
const HEADING = '#1C2420'

export function PreRegistrationClient() {
  const sendPreRegistration = useSendPreRegistration()

  const [program, setProgram] = useState('sibyan')
  const [studentName, setStudentName] = useState('')
  const [studentAge, setStudentAge] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentName || !studentAge || !parentName || !parentPhone) {
      setErrorMsg('Lütfen tüm alanları doldurun.')
      return
    }
    setErrorMsg('')
    try {
      await sendPreRegistration.mutateAsync({ program, student_name: studentName, student_age: studentAge, parent_name: parentName, parent_phone: parentPhone })
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Ön kaydınız gönderilemedi. Lütfen tekrar deneyin.')
    }
  }

  return (
    <div className="font-sans" style={{ color: HEADING }}>
      <div className="max-w-[760px] mx-auto px-6 pt-14 pb-20">
        <Link href="/" className="font-bold text-sm mb-6 inline-block" style={{ color: PRIMARY }}>
          ← Ana sayfaya dön
        </Link>
        <h1 className="font-heading text-[38px] font-bold mb-2">2026-2027 Ön Kayıt Formu</h1>
        <p className="text-[15px] leading-relaxed mb-7" style={{ color: TEXT }}>
          Kontenjanlar sınırlıdır. Ön kayıt sonrası kurumumuz sizi arayarak mülakat/tanışma randevusu verir.
        </p>

        {sendPreRegistration.isSuccess ? (
          <div className="bg-white rounded-2xl p-10 text-center" style={{ border: `1px solid ${BORDER}` }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-extrabold mx-auto mb-3.5" style={{ background: BG, color: PRIMARY }}>
              ✓
            </div>
            <div className="font-heading text-xl font-bold mb-2">Ön kaydınız alındı</div>
            <div className="text-sm" style={{ color: TEXT }}>
              Kayıt ekibimiz {parentPhone} numarasından en geç 3 iş günü içinde size ulaşacak.
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-7" style={{ border: `1px solid ${BORDER}` }}>
            <div className="text-[13px] font-bold mb-2" style={{ color: LABEL }}>Program Seçimi *</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4.5">
              {PROGRAMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProgram(p.value)}
                  className="font-semibold text-[13.5px] px-2 py-2.5 rounded-lg border-[1.5px] transition-colors"
                  style={
                    program === p.value
                      ? { borderColor: PRIMARY, background: BG, color: PRIMARY }
                      : { borderColor: BORDER, background: '#FFFFFF', color: LABEL }
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {errorMsg && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 font-medium">{errorMsg}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Öğrenci Adı Soyadı *"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="rounded-lg border p-3 text-sm outline-none"
                  style={{ borderColor: BORDER }}
                />
                <input
                  type="text"
                  placeholder="Öğrenci Yaşı *"
                  value={studentAge}
                  onChange={(e) => setStudentAge(e.target.value)}
                  className="rounded-lg border p-3 text-sm outline-none"
                  style={{ borderColor: BORDER }}
                />
                <input
                  type="text"
                  placeholder="Veli Adı Soyadı *"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  className="rounded-lg border p-3 text-sm outline-none"
                  style={{ borderColor: BORDER }}
                />
                <input
                  type="tel"
                  placeholder="Veli Telefonu *"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  className="rounded-lg border p-3 text-sm outline-none"
                  style={{ borderColor: BORDER }}
                />
              </div>
              <button
                type="submit"
                disabled={sendPreRegistration.isPending}
                className="w-full text-white font-extrabold text-[15px] py-3.5 rounded-[10px] disabled:opacity-60"
                style={{ background: PRIMARY }}
              >
                {sendPreRegistration.isPending ? 'Gönderiliyor...' : 'Ön Kaydı Gönder'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

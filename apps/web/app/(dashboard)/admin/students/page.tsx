'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, GraduationCap, HeartHandshake, MessageCircle, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { Card, Button } from '@e-infak/ui'
import { PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'
import { DonorPicker, type PickedDonor } from '../../../../components/admin/DonorPicker'
import { adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess, whatsappUrl } from '../../../../lib/admin-access'

interface Student {
  id: string
  first_name: string
  last_name: string
  parent_name: string
  parent_phone: string
  parent_email?: string | null
}

interface ProgressLog {
  id: string
  check_date: string
  memorized_pages: number
  current_surah: string
  instructor_notes?: string
}

interface Sponsor {
  id: string
  donor_name: string
  donor_phone: string | null
  amount_cents: number
  is_active: boolean
}

const TOTAL_QURAN_PAGES = 604

export default function AdminStudentsPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'operations_manage')

  const [students, setStudents] = useState<Student[]>([])
  const [query, setQuery] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])

  // Add Student Form State
  const [showAddForm, setShowAddForm] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newParentName, setNewParentName] = useState('')
  const [newParentPhone, setNewParentPhone] = useState('')
  const [newParentEmail, setNewParentEmail] = useState('')

  // Edit Student Modal State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', parent_name: '', parent_phone: '', parent_email: '' })

  // Lesson Log Form State
  const [newSurah, setNewSurah] = useState('')
  const [newPages, setNewPages] = useState('1')
  const [instructorNotes, setInstructorNotes] = useState('')

  // Add Sponsor State
  const [pickedDonor, setPickedDonor] = useState<PickedDonor | null>(null)
  const [sponsorshipAmount, setSponsorshipAmount] = useState('500')

  const [loading, setLoading] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [savingSponsorship, setSavingSponsorship] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const loadStudents = async () => {
    setLoading(true)
    try {
      const res = await adminGet<Student[]>('/students')
      setStudents(res.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Öğrenci kayıtları yüklenemedi') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [])

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.parent_name} ${s.parent_phone}`.toLowerCase().includes(q),
    )
  }, [students, query])

  const totalPages = useMemo(
    () => progressLogs.reduce((sum, l) => sum + (Number(l.memorized_pages) || 0), 0),
    [progressLogs],
  )
  const progressPct = Math.min(100, Math.round((totalPages / TOTAL_QURAN_PAGES) * 100))
  const estimatedJuz = Math.min(30, Math.floor(totalPages / 20))
  const totalSponsorCents = useMemo(
    () => sponsors.filter((s) => s.is_active).reduce((sum, s) => sum + s.amount_cents, 0),
    [sponsors],
  )

  const handleSelectStudent = async (st: Student) => {
    setSelectedStudent(st)
    setProgressLogs([])
    setSponsors([])
    setMessage(null)
    try {
      const [progRes, spRes] = await Promise.all([
        adminGet<ProgressLog[]>(`/students/${st.id}/progress`),
        adminGet<Sponsor[]>(`/students/${st.id}/sponsorships`),
      ])
      setProgressLogs(progRes.data)
      setSponsors(spRes.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Öğrenci detayları yüklenemedi') })
    }
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    try {
      const res = await adminSend<Student>('post', '/students', {
        first_name: newFirstName,
        last_name: newLastName,
        parent_name: newParentName,
        parent_phone: newParentPhone,
        parent_email: newParentEmail || null,
      })
      setStudents((prev) => [...prev, res.data])
      setShowAddForm(false)
      setNewFirstName('')
      setNewLastName('')
      setNewParentName('')
      setNewParentPhone('')
      setNewParentEmail('')
      toast.ok('Öğrenci kaydı oluşturuldu')
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Öğrenci eklenemedi') })
    }
  }

  const openEditStudent = (st: Student) => {
    setEditingStudent(st)
    setEditForm({
      first_name: st.first_name,
      last_name: st.last_name,
      parent_name: st.parent_name,
      parent_phone: st.parent_phone,
      parent_email: st.parent_email || '',
    })
  }

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStudent) return
    setMessage(null)
    try {
      const res = await adminSend<Student>('put', `/students/${editingStudent.id}`, {
        ...editForm,
        parent_email: editForm.parent_email || null,
      })
      setStudents((prev) => prev.map((s) => (s.id === res.data.id ? res.data : s)))
      if (selectedStudent?.id === res.data.id) setSelectedStudent(res.data)
      setEditingStudent(null)
      toast.ok('Öğrenci bilgileri güncellendi')
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Öğrenci güncellenemedi') })
    }
  }

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudent || !newSurah.trim()) return
    setSavingProgress(true)
    setMessage(null)
    try {
      const res = await adminSend<ProgressLog>('post', `/students/${selectedStudent.id}/progress`, {
        memorized_pages: Number(newPages),
        current_surah: newSurah,
        instructor_notes: instructorNotes || null,
      })
      setProgressLogs((prev) => [res.data, ...prev])
      setNewSurah('')
      setNewPages('1')
      setInstructorNotes('')
      setMessage({ type: 'ok', text: 'Öğrenci gelişim kaydı eklendi ve sponsorlara bildirildi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Ders kaydı eklenemedi') })
    } finally {
      setSavingProgress(false)
    }
  }

  const handleLinkSponsor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudent || !pickedDonor) return
    setSavingSponsorship(true)
    setMessage(null)
    try {
      await adminSend('post', `/students/${selectedStudent.id}/sponsorships`, {
        donor_id: pickedDonor.id,
        amount_cents: Math.round(Number(sponsorshipAmount) * 100),
      })
      const spRes = await adminGet<Sponsor[]>(`/students/${selectedStudent.id}/sponsorships`)
      setSponsors(spRes.data)
      setPickedDonor(null)
      setMessage({ type: 'ok', text: 'Sponsorluk eşleşmesi başarıyla sağlandı.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sponsor eklenemedi') })
    } finally {
      setSavingSponsorship(false)
    }
  }

  const handleRemoveSponsor = async (sp: Sponsor) => {
    if (!selectedStudent) return
    if (!(await confirmDialog(`${sp.donor_name} sponsorluğu kaldırılsın mı?`))) return
    try {
      await adminSend('delete', `/students/${selectedStudent.id}/sponsorships/${sp.id}`)
      setSponsors((prev) => prev.filter((item) => item.id !== sp.id))
      toast.ok('Sponsorluk kaldırıldı')
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Sponsorluk kaldırılamadı') })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hafızlık Öğrencileri"
        description="Medrese talebeleri, 604 sayfa ezber ilerleme takibi ve sponsor eşleştirme."
        actions={canEdit && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
          >
            {showAddForm ? <><X className="h-4 w-4" /> İptal Et</> : <><Plus className="h-4 w-4" /> Yeni Öğrenci Ekle</>}
          </button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Kayıtlı Öğrenci"
          icon={Users}
          value={students.length}
          detail={{
            title: 'Hafızlık Öğrenci Listesi',
            content: () => (
              <Table>
                <THead><Tr><Th>Öğrenci</Th><Th>Veli</Th><Th className="text-right">Telefon</Th></Tr></THead>
                <TBody>
                  {students.map((st) => (
                    <Tr key={st.id}>
                      <Td className="font-semibold">{st.first_name} {st.last_name}</Td>
                      <Td className="text-xs text-gray-500">{st.parent_name || '—'}</Td>
                      <Td className="text-right font-mono text-xs text-gray-500">{st.parent_phone || '—'}</Td>
                    </Tr>
                  ))}
                  {students.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Öğrenci yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Seçili Talebe İlerlemesi"
          icon={BookOpen}
          value={selectedStudent ? `${totalPages} / ${TOTAL_QURAN_PAGES} sayfa` : '—'}
          hint={selectedStudent && `Yaklaşık ${estimatedJuz}. Cüz · %${progressPct}`}
          detail={selectedStudent ? {
            title: `${selectedStudent.first_name} ${selectedStudent.last_name} · Ders Geçmişi`,
            description: `${totalPages} / ${TOTAL_QURAN_PAGES} sayfa · Yaklaşık ${estimatedJuz}. Cüz`,
            content: () => (
              <Table>
                <THead><Tr><Th>Tarih</Th><Th>Ders / Not</Th><Th className="text-right">Sayfa</Th></Tr></THead>
                <TBody>
                  {progressLogs.map((log: any, idx: number) => (
                    <Tr key={log.id || idx}>
                      <Td className="text-xs">{log.created_at ? new Date(log.created_at).toLocaleDateString('tr-TR') : '—'}</Td>
                      <Td className="text-xs">{log.notes || log.surah_name || '—'}</Td>
                      <Td className="text-right font-semibold tabular-nums">{log.pages_memorized ?? log.pages_count ?? 0}</Td>
                    </Tr>
                  ))}
                  {progressLogs.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Ders kaydı yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          } : undefined}
        />
        <StatCard
          label="Seçili Talebe Aylık Sponsorluk"
          icon={HeartHandshake}
          tone="good"
          value={selectedStudent ? formatMoney(totalSponsorCents) : '—'}
          detail={selectedStudent ? {
            title: `${selectedStudent.first_name} ${selectedStudent.last_name} · Sponsorlar`,
            content: () => (
              <Table>
                <THead><Tr><Th>Sponsor</Th><Th>Telefon</Th><Th className="text-right">Aylık Tutar</Th></Tr></THead>
                <TBody>
                  {sponsors.map((sp: any, idx: number) => (
                    <Tr key={sp.id || idx}>
                      <Td className="font-semibold">{sp.donor_name || sp.full_name || '—'}</Td>
                      <Td className="text-xs text-gray-500">{sp.donor_phone || '—'}</Td>
                      <Td className="text-right font-bold tabular-nums text-emerald-700">{formatMoney(sp.monthly_amount_cents || 0)}</Td>
                    </Tr>
                  ))}
                  {sponsors.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Sponsor kaydı yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          } : undefined}
        />
      </div>

      {message && (
        <div className={`rounded-lg border p-3 text-sm font-semibold ${message.type === 'ok' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Add Student Collapse Form */}
      {showAddForm && canEdit && (
        <Card className="max-w-2xl space-y-4 border border-gray-100 p-6 shadow-sm">
          <h2 className="border-b pb-2 text-base font-bold text-gray-900">Yeni Öğrenci Bilgileri</h2>
          <form onSubmit={handleAddStudent} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Ad *</label>
                <input
                  type="text"
                  placeholder="Örn: Ömer"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Soyad *</label>
                <input
                  type="text"
                  placeholder="Örn: Yılmaz"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Veli Adı Soyadı *</label>
                <input
                  type="text"
                  placeholder="Örn: Ahmet Yılmaz"
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Veli Telefonu *</label>
                <input
                  type="text"
                  placeholder="Örn: +90 555..."
                  value={newParentPhone}
                  onChange={(e) => setNewParentPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Veli E-Postası</label>
                <input
                  type="email"
                  placeholder="Örn: veli@gmail.com"
                  value={newParentEmail}
                  onChange={(e) => setNewParentEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" className="rounded-lg bg-primary-600 px-5 py-2 text-xs font-bold text-white">
                Öğrenci Kaydet
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-gray-500 animate-pulse">Öğrenci kayıtları yükleniyor...</p>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-12">
          {/* Left: Students List */}
          <div className={`${selectedStudent ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <GraduationCap className="h-4 w-4 text-primary-600" /> Kayıtlı Medrese Talebeleri
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-56">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Öğrenci veya veli ara..."
                      className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary-500"
                    />
                  </div>
                  {students.length > 0 && (
                    <button
                      type="button"
                      onClick={() => exportCsv('hafizlik-ogrencileri.csv', ['Ad', 'Soyad', 'Veli', 'Telefon', 'E-posta'],
                        filteredStudents.map((s) => [s.first_name, s.last_name, s.parent_name, s.parent_phone, s.parent_email || '']))}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2.5">
                {filteredStudents.map((st) => (
                  <div
                    key={st.id}
                    onClick={() => handleSelectStudent(st)}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                      selectedStudent?.id === st.id ? 'border-primary-600 bg-primary-50/30' : 'border-gray-100 bg-gray-50 hover:bg-gray-100/60'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-gray-900">{st.first_name} {st.last_name}</div>
                      <div className="mt-1 text-[11px] font-medium text-gray-500">Veli: {st.parent_name} · {st.parent_phone}</div>
                    </div>
                    <Button size="sm" variant="ghost" className="text-[11px] font-bold text-primary-600">
                      Yönet →
                    </Button>
                  </div>
                ))}
                {filteredStudents.length === 0 && (
                  <p className="py-6 text-center text-xs text-gray-400">
                    {students.length === 0 ? 'Henüz kayıtlı öğrenci yok.' : 'Aramaya uygun öğrenci bulunamadı.'}
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Right: Selected Student details */}
          {selectedStudent && (
            <div className="space-y-6 lg:col-span-7">
              <Card className="relative space-y-6 border border-gray-100 p-6 shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="rounded bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-800">Talebe Eğitim & Sponsor Profili</span>
                    <h2 className="mt-2 text-xl font-bold text-gray-900">{selectedStudent.first_name} {selectedStudent.last_name}</h2>
                    <p className="text-xs text-gray-500">
                      Veli: {selectedStudent.parent_name} · {selectedStudent.parent_phone}
                      {selectedStudent.parent_email ? ` · ${selectedStudent.parent_email}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const wa = whatsappUrl(selectedStudent.parent_phone, `Merhaba ${selectedStudent.parent_name}, ${selectedStudent.first_name} ${selectedStudent.last_name} öğrencimizin güncel hafızlık durumu: ${totalPages}/${TOTAL_QURAN_PAGES} sayfa (${estimatedJuz}. cüz).`)
                      return wa ? (
                        <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                      ) : null
                    })()}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditStudent(selectedStudent)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="h-3 w-3" /> Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!(await confirmDialog(`${selectedStudent.first_name} ${selectedStudent.last_name} kaydı silinsin mi?`))) return
                            try {
                              await adminSend('delete', `/students/${selectedStudent.id}`)
                              toast.ok('Öğrenci silindi')
                              setSelectedStudent(null)
                              await loadStudents()
                            } catch (err) {
                              toast.error(apiErrorMessage(err, 'Öğrenci silinemedi'))
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" /> Sil
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setSelectedStudent(null)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Hafızlık 604 sayfa ilerleme çubuğu */}
                <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                    <span>Kur&apos;an-ı Kerim Hafızlık İlerlemesi</span>
                    <span className="text-amber-800">{totalPages} / {TOTAL_QURAN_PAGES} sayfa (%{progressPct}) · {estimatedJuz}. Cüz</span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-amber-100">
                    <div className="h-full rounded-full bg-amber-600 transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>

                {/* Sponsors Match Panel */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="border-b pb-1.5 text-sm font-bold text-gray-900">Sponsor Eşleştirme</h3>

                  <div className="space-y-2">
                    {sponsors.length === 0 ? (
                      <p className="text-xs text-gray-400">Bu öğrenciye atanmış aktif sponsor bulunmamaktadır.</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {sponsors.map((sp) => (
                          <div key={sp.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                            <div>
                              <span className="font-bold text-gray-900">{sp.donor_name}</span>
                              <span className="block font-mono text-[10px] text-gray-400">{sp.donor_phone || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-emerald-700">{formatMoney(sp.amount_cents)}/Ay</span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSponsor(sp)}
                                  className="rounded p-1 text-red-500 hover:bg-red-50"
                                  title="Sponsorluğu kaldır"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <form onSubmit={handleLinkSponsor} className="flex flex-wrap items-end gap-3 pt-2">
                      <div className="min-w-56 flex-1">
                        <DonorPicker value={pickedDonor} onChange={setPickedDonor} label="Sponsor Bağışçı Seçin" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">Aylık Tutar (₺)</label>
                        <input
                          type="number"
                          min={1}
                          value={sponsorshipAmount}
                          onChange={(e) => setSponsorshipAmount(e.target.value)}
                          className="w-24 rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500"
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={savingSponsorship || !pickedDonor}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {savingSponsorship ? 'Atanıyor...' : 'Sponsor Eşle'}
                      </Button>
                    </form>
                  )}
                </div>

                {/* Lesson logs & checklist */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="border-b pb-1.5 text-sm font-bold text-gray-900">Hafızlık / Ders Takip Günlüğü</h3>

                  {canEdit && (
                    <form onSubmit={handleSaveProgress} className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/20 p-4">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">Hoca Ders Girişi</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-bold text-gray-600">Ezberlenen Sure / Cüz *</label>
                          <input
                            type="text"
                            placeholder="Örn: Yasin Suresi"
                            value={newSurah}
                            onChange={(e) => setNewSurah(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs outline-none focus:border-primary-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-bold text-gray-600">Sayfa Sayısı *</label>
                          <input
                            type="number"
                            min={1}
                            value={newPages}
                            onChange={(e) => setNewPages(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs outline-none focus:border-primary-500"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">Eğitmen Notları</label>
                        <textarea
                          placeholder="Örn: Tecvid kurallarına dikkat etmesi gerekiyor..."
                          value={instructorNotes}
                          onChange={(e) => setInstructorNotes(e.target.value)}
                          className="min-h-[50px] w-full rounded-lg border border-gray-300 bg-white p-2 text-xs outline-none focus:border-primary-500"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={savingProgress}
                          className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-bold text-white"
                        >
                          {savingProgress ? 'Kaydediliyor...' : 'Ders Kaydet'}
                        </Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Ders Geçmişi ({progressLogs.length})</label>
                    {progressLogs.length === 0 ? (
                      <p className="text-xs text-gray-400">Henüz ders kaydı girilmemiştir.</p>
                    ) : (
                      <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
                        {progressLogs.map((log) => (
                          <div key={log.id} className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-gray-900">{log.current_surah} ({log.memorized_pages} Sayfa)</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400">{new Date(log.check_date).toLocaleDateString('tr-TR')}</span>
                                {canEdit && (
                                  <button
                                    type="button"
                                    title="Ders kaydını sil"
                                    onClick={async () => {
                                      if (!(await confirmDialog('Bu ders kaydı silinsin mi?'))) return
                                      try {
                                        await adminSend('delete', `/students/${selectedStudent.id}/progress/${log.id}`)
                                        toast.ok('Ders kaydı silindi')
                                        await handleSelectStudent(selectedStudent)
                                      } catch (err) {
                                        toast.error(apiErrorMessage(err, 'Ders kaydı silinemedi'))
                                      }
                                    }}
                                    className="text-gray-400 hover:text-red-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {log.instructor_notes && (
                              <p className="rounded-lg bg-gray-50 p-2 text-[11px] italic leading-relaxed text-gray-500">
                                Not: {log.instructor_notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingStudent(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Öğrenci Bilgilerini Düzenle</h3>
              <button type="button" onClick={() => setEditingStudent(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Ad *</label>
                  <input required value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Soyad *</label>
                  <input required value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Veli Adı Soyadı *</label>
                  <input required value={editForm.parent_name} onChange={(e) => setEditForm({ ...editForm, parent_name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Veli Telefonu *</label>
                  <input required value={editForm.parent_phone} onChange={(e) => setEditForm({ ...editForm, parent_phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Veli E-Postası</label>
                <input type="email" value={editForm.parent_email} onChange={(e) => setEditForm({ ...editForm, parent_email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingStudent(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Vazgeç</button>
                <Button type="submit" className="rounded-lg bg-primary-600 px-5 py-2 text-xs font-bold text-white">Kaydet</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Linking from 'expo-linking'
import { Mail, Phone, Plus, QrCode, Search, X } from 'lucide-react-native'
import { useAuth } from '../../src/context/AuthContext'
import { apiFetch, formatMoney, WEB_BASE_URL } from '../../src/lib/api'
import { CARD_SHADOW, COLORS } from '../../src/theme'

interface TaskRow {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  overdue: boolean
}

interface DonorRow {
  id: string
  display_name?: string
  first_name?: string
  last_name?: string
  company_name?: string
  phone?: string | null
  email?: string | null
  total_donated_cents?: number
}

interface MoneyBoxRow {
  id: string
  code: string
  location_name: string
  address?: string | null
  status: string
}

type AdminTab = 'tasks' | 'crm' | 'boxes'

export default function AdminScreen() {
  const { isStaffOrAdmin } = useAuth()
  const [subTab, setSubTab] = useState<AdminTab>('tasks')
  const [monthly, setMonthly] = useState<{ total_cents: number; count: number; year: number } | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [quickTask, setQuickTask] = useState('')
  const [donorQuery, setDonorQuery] = useState('')
  const [donors, setDonors] = useState<DonorRow[]>([])
  const [boxes, setBoxes] = useState<MoneyBoxRow[]>([])
  const [qrOpen, setQrOpen] = useState(false)
  const [scanBox, setScanBox] = useState<MoneyBoxRow | null>(null)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectNote, setCollectNote] = useState('')
  const [submittingBox, setSubmittingBox] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!isStaffOrAdmin) return
    try {
      const [mRes, tRes, dRes, bRes] = await Promise.all([
        apiFetch<{ total_cents: number; count: number; year: number }>('/admin-features/reports/monthly').catch(() => null),
        apiFetch<TaskRow[]>('/admin-features/tasks?scope=mine&status=open').catch(() => []),
        apiFetch<{ items?: DonorRow[] }>('/admin-features/donors?page_size=20').catch(() => ({ items: [] })),
        apiFetch<MoneyBoxRow[]>('/admin-features/money-boxes').catch(() => []),
      ])
      setMonthly(mRes)
      setTasks(tRes || [])
      setDonors(dRes?.items || [])
      setBoxes(bRes || [])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isStaffOrAdmin])

  useEffect(() => {
    load()
  }, [load])

  const searchDonors = async () => {
    try {
      const q = encodeURIComponent(donorQuery.trim())
      const res = await apiFetch<{ items?: DonorRow[] }>(`/admin-features/donors?q=${q}&page_size=25`)
      setDonors(res?.items || [])
    } catch {
      // ignore
    }
  }

  const addQuickTask = async () => {
    if (quickTask.trim().length < 2) return
    try {
      await apiFetch('/admin-features/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: quickTask.trim() }),
      })
      setQuickTask('')
      load()
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Görev eklenemedi')
    }
  }

  const markDone = async (t: TaskRow) => {
    try {
      await apiFetch(`/admin-features/tasks/${t.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'done' }),
      })
      Alert.alert('Tamamlandı', `"${t.title}" tamamlandı olarak işaretlendi.`)
      load()
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Görev güncellenemedi')
    }
  }

  if (!isStaffOrAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Bu alan yalnız yetkili personel ve yöneticiler içindir.</Text>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            load()
          }}
        />
      }
    >
      {monthly && (
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{monthly.year} Toplam Bağış</Text>
            <Text style={styles.kpiValue}>{formatMoney(monthly.total_cents)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Onaylı İşlem</Text>
            <Text style={styles.kpiValue}>{monthly.count.toLocaleString('tr-TR')}</Text>
          </View>
        </View>
      )}

      <View style={styles.segRow}>
        {([
          ['tasks', `Görevler (${tasks.length})`],
          ['crm', 'Bağışçı CRM'],
          ['boxes', `Kumbara (${boxes.length})`],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setSubTab(key)}
            style={[styles.segBtn, subTab === key && styles.segBtnActive]}
          >
            <Text style={[styles.segText, subTab === key && styles.segTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'tasks' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Açık Görevlerim</Text>
          <View style={styles.quickAddRow}>
            <TextInput
              value={quickTask}
              onChangeText={setQuickTask}
              placeholder="Hızlı görev ekle..."
              style={styles.quickInput}
              onSubmitEditing={addQuickTask}
            />
            <TouchableOpacity style={styles.addBtn} onPress={addQuickTask}>
              <Plus color="#ffffff" size={18} />
            </TouchableOpacity>
          </View>
          {tasks.length === 0 ? (
            <Text style={styles.empty}>Üzerinizde açık görev bulunmuyor.</Text>
          ) : (
            tasks.slice(0, 15).map((t) => (
              <View key={t.id} style={styles.taskRow}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle}>{t.title}</Text>
                  <Text style={[styles.taskMeta, t.overdue && styles.overdue]}>
                    {t.due_date
                      ? `Son Tarih: ${new Date(t.due_date).toLocaleDateString('tr-TR')}`
                      : 'Tarihsiz'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.doneBtn} onPress={() => markDone(t)}>
                  <Text style={styles.doneBtnText}>Tamamla</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {subTab === 'crm' && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bağışçı Rehberi (CRM)</Text>
          <View style={styles.quickAddRow}>
            <TextInput
              value={donorQuery}
              onChangeText={setDonorQuery}
              placeholder="Ad, telefon veya e-posta ara..."
              style={styles.quickInput}
              onSubmitEditing={searchDonors}
            />
            <TouchableOpacity style={styles.addBtn} onPress={searchDonors}>
              <Search color="#ffffff" size={16} />
            </TouchableOpacity>
          </View>
          {donors.length === 0 ? (
            <Text style={styles.empty}>Bağışçı bulunamadı.</Text>
          ) : (
            donors.map((d) => {
              const name =
                d.display_name ||
                d.company_name ||
                `${d.first_name || ''} ${d.last_name || ''}`.trim() ||
                'Bağışçı'
              return (
                <View key={d.id} style={styles.taskRow}>
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle}>{name}</Text>
                    <Text style={styles.taskMeta}>
                      Toplam: {formatMoney(d.total_donated_cents || 0)}
                    </Text>
                  </View>
                  <View style={styles.crmActions}>
                    {d.phone ? (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => Linking.openURL(`tel:${d.phone}`)}
                      >
                        <Phone color={COLORS.primary} size={15} />
                      </TouchableOpacity>
                    ) : null}
                    {d.email ? (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => Linking.openURL(`mailto:${d.email}`)}
                      >
                        <Mail color={COLORS.info} size={15} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )
            })
          )}
        </View>
      )}

      {subTab === 'boxes' && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Kumbara Noktaları</Text>
            <TouchableOpacity
              style={styles.qrBtn}
              onPress={async () => {
                if (!permission?.granted) {
                  const res = await requestPermission()
                  if (!res.granted) {
                    Alert.alert('İzin Gerekli', 'QR kod okumak için kamera izni verin.')
                    return
                  }
                }
                setScanBox(null)
                setQrOpen(true)
              }}
            >
              <QrCode color="#ffffff" size={14} />
              <Text style={styles.qrBtnText}>QR Okut & Topla</Text>
            </TouchableOpacity>
          </View>
          {boxes.length === 0 ? (
            <Text style={styles.empty}>Kayıtlı kumbara bulunmuyor.</Text>
          ) : (
            boxes.slice(0, 20).map((b) => (
              <TouchableOpacity
                key={b.id}
                style={styles.taskRow}
                onPress={() => {
                  setScanBox(b)
                  setCollectAmount('')
                  setCollectNote('')
                  setQrOpen(true)
                }}
              >
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle}>
                    {b.code} · {b.location_name}
                  </Text>
                  {b.address ? <Text style={styles.taskMeta}>{b.address}</Text> : null}
                </View>
                <View style={styles.boxBadge}>
                  <Text style={styles.boxBadgeText}>{b.status}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <Modal visible={qrOpen} animationType="slide" onRequestClose={() => setQrOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <Text style={styles.sectionTitle}>
              {scanBox ? `${scanBox.code} · ${scanBox.location_name}` : 'Kumbara QR Okut'}
            </Text>
            <TouchableOpacity onPress={() => setQrOpen(false)}>
              <X color={COLORS.text} size={22} />
            </TouchableOpacity>
          </View>

          {!scanBox ? (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                const match = boxes.find(
                  (b) => b.code.toLowerCase() === data.trim().toLowerCase() || b.id === data.trim(),
                )
                if (match) {
                  setScanBox(match)
                } else {
                  Alert.alert('Bulunamadı', `Okunan kod (${data}) kayıtlı kumbaralarla eşleşmedi.`)
                  setQrOpen(false)
                }
              }}
            />
          ) : (
            <View style={styles.collectForm}>
              <Text style={styles.kpiLabel}>Toplanan Tutar (TL)</Text>
              <TextInput
                value={collectAmount}
                onChangeText={setCollectAmount}
                keyboardType="numeric"
                placeholder="Örn: 1250"
                style={styles.quickInput}
              />
              <Text style={styles.kpiLabel}>Not (opsiyonel)</Text>
              <TextInput
                value={collectNote}
                onChangeText={setCollectNote}
                placeholder="Teslim alan / açıklama..."
                style={styles.quickInput}
              />
              <TouchableOpacity
                style={styles.webBtn}
                disabled={submittingBox}
                onPress={async () => {
                  const amountCents = Math.round((Number(collectAmount.replace(',', '.')) || 0) * 100)
                  if (amountCents <= 0) {
                    Alert.alert('Hata', 'Geçerli bir tutar girin.')
                    return
                  }
                  setSubmittingBox(true)
                  try {
                    await apiFetch(`/admin-features/money-boxes/${scanBox.id}/collections`, {
                      method: 'POST',
                      body: JSON.stringify({
                        amount_cents: amountCents,
                        currency: 'TRY',
                        idempotency_key: `${scanBox.id}-${Date.now()}`,
                        notes: collectNote.trim() || null,
                      }),
                    })
                    Alert.alert('Başarılı', 'Kumbara toplaması kaydedildi.')
                    setQrOpen(false)
                    load()
                  } catch (err: any) {
                    Alert.alert('Hata', err?.message || 'Kumbara toplaması kaydedilemedi')
                  } finally {
                    setSubmittingBox(false)
                  }
                }}
              >
                <Text style={styles.webBtnText}>
                  {submittingBox ? 'Kaydediliyor...' : 'Toplamayı Kaydet'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.webBtn}
        onPress={() => Linking.openURL(`${WEB_BASE_URL}/admin`)}
      >
        <Text style={styles.webBtnText}>Tam Web Yönetim Panelini Aç</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, gap: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.bg },
  kpiRow: { flexDirection: 'row', gap: 12 },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
    ...CARD_SHADOW,
  },
  kpiLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  kpiValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  segRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.border,
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnActive: { backgroundColor: COLORS.card },
  segText: { fontSize: 12, fontWeight: '600', color: COLORS.textSubtle },
  segTextActive: { color: COLORS.text, fontWeight: '700' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  qrBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 54, paddingHorizontal: 16, gap: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  camera: { flex: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  collectForm: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  quickAddRow: { flexDirection: 'row', gap: 8 },
  quickInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: COLORS.bg,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  taskInfo: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  taskMeta: { fontSize: 11, color: COLORS.textMuted },
  overdue: { color: COLORS.danger, fontWeight: '700' },
  doneBtn: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  doneBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  crmActions: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 8,
  },
  boxBadge: {
    backgroundColor: COLORS.infoSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  boxBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.info },
  webBtn: {
    backgroundColor: COLORS.text,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  webBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  empty: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 12 },
})

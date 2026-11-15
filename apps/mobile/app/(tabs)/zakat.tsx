import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'

export default function ZakatScreen() {
  const router = useRouter()
  const [cash, setCash] = useState('')
  const [gold, setGold] = useState('')
  const [stocks, setStocks] = useState('')
  const [debt, setDebt] = useState('')

  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0)

  const { net, zakat } = useMemo(() => {
    const total = num(cash) + num(gold) + num(stocks) - num(debt)
    const netVal = Math.max(0, total)
    return { net: netVal, zakat: Math.round(netVal * 0.025 * 100) / 100 }
  }, [cash, gold, stocks, debt])

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Zekât Hesaplayıcı</Text>
        <Text style={styles.sub}>
          Nakit, altın/döviz ve ticari varlıklarınızdan borçlarınızı düşerek %2,5 zekât tutarınızı hesaplayın.
        </Text>

        <Field label="Nakit & Banka (TL)" value={cash} onChange={setCash} />
        <Field label="Altın & Döviz Değeri (TL)" value={gold} onChange={setGold} />
        <Field label="Ticari Mal & Alacaklar (TL)" value={stocks} onChange={setStocks} />
        <Field label="Kısa Vadeli Borçlar (TL)" value={debt} onChange={setDebt} />
      </View>

      <View style={styles.resultCard}>
        <Text style={styles.resultLabel}>Net Zekât Matrahı</Text>
        <Text style={styles.resultValue}>{net.toLocaleString('tr-TR')} TL</Text>
        <View style={styles.divider} />
        <Text style={styles.resultLabel}>Ödenecek Zekât (%2,5)</Text>
        <Text style={styles.zakatValue}>{zakat.toLocaleString('tr-TR')} TL</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.push('/(tabs)')}
        >
          <Text style={styles.btnText}>Zekât Kampanyalarını Gör</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        style={styles.input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: '#334155' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#f8fafc',
  },
  resultCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    gap: 8,
  },
  resultLabel: { fontSize: 12, fontWeight: '600', color: '#065f46' },
  resultValue: { fontSize: 18, fontWeight: '700', color: '#064e3b' },
  zakatValue: { fontSize: 26, fontWeight: '800', color: '#059669' },
  divider: { height: 1, backgroundColor: '#a7f3d0', marginVertical: 4 },
  btn: {
    marginTop: 8,
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
})

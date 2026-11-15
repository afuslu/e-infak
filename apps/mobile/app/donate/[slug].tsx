import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { WebView } from 'react-native-webview'
import { WEB_BASE_URL } from '../../src/lib/api'

export default function DonateWebViewScreen() {
  const { slug, title, amount } = useLocalSearchParams<{
    slug: string
    title?: string
    amount?: string
  }>()
  const qs = amount ? `?amount=${encodeURIComponent(amount)}` : ''
  const url = `${WEB_BASE_URL}/kampanyalar/${slug || ''}${qs}`

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: title || 'Güvenli Bağış' }} />
      <WebView
        source={{ uri: url }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
})

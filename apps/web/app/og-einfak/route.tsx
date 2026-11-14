import { ImageResponse } from 'next/og'

/** Share image (1200x630) of the e-infak.org landing page. */
export async function GET() {
  const bars = [42, 55, 48, 71, 63, 88]
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#F6F8F7', padding: 72, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 620 }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: '#047857' }}>e-infak.org</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 28, fontSize: 62, fontWeight: 800, lineHeight: 1.1, color: '#0E1B17' }}>
            Bağış siteniz ve dernek otomasyonunuz tek panelde
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 28, fontSize: 28, color: '#475A54' }}>
            Online bağış, havale eşleştirme, makbuz, SMS ve bağışçı yönetimi
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', width: 360, height: 300, padding: 28, background: '#FFFFFF', border: '2px solid #E3E8E6', borderRadius: 28 }}>
          {bars.map((height, index) => (
            <div key={index} style={{ display: 'flex', flex: 1, height: `${height}%`, marginLeft: index ? 12 : 0, borderRadius: 10, background: '#047857', opacity: 0.45 + index * 0.11 }} />
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}

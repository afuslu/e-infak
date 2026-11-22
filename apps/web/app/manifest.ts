import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'E-İnfak Bağışçı Paneli',
    short_name: 'Bağışçı Paneli',
    description: 'Bağışlarınızı, makbuzlarınızı, kurban videolarınızı ve su kuyularınızı tek yerden takip edin.',
    start_url: '/portal',
    display: 'standalone',
    background_color: '#047857',
    theme_color: '#047857',
    lang: 'tr',
    icons: [
      {
        src: '/images/e-infak/mark.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/images/e-infak/mark.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

/**
 * Fonts an organisation can pick in Görünüm & Tema (keys match FONTS in
 * services/backend/app/services/site.py). They are self-hosted by next/font, so
 * the CSP needs no third-party font host; each one only defines @font-face rules
 * and a `--ff-<key>` variable, and the browser downloads just the families in use.
 */
import {
  Amiri, Cairo, Inter, Lora, Merriweather, Montserrat, Nunito, Open_Sans,
  Playfair_Display, Poppins, Public_Sans, Roboto_Slab,
} from 'next/font/google'

const publicSans = Public_Sans({ subsets: ['latin', 'latin-ext'], variable: '--ff-public-sans' })
const lora = Lora({ subsets: ['latin', 'latin-ext'], variable: '--ff-lora' })
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--ff-inter', preload: false })
const poppins = Poppins({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700', '800'], variable: '--ff-poppins', preload: false })
const montserrat = Montserrat({ subsets: ['latin', 'latin-ext'], variable: '--ff-montserrat', preload: false })
const nunito = Nunito({ subsets: ['latin', 'latin-ext'], variable: '--ff-nunito', preload: false })
const openSans = Open_Sans({ subsets: ['latin', 'latin-ext'], variable: '--ff-open-sans', preload: false })
const merriweather = Merriweather({ subsets: ['latin', 'latin-ext'], weight: ['400', '700', '900'], variable: '--ff-merriweather', preload: false })
const playfair = Playfair_Display({ subsets: ['latin', 'latin-ext'], variable: '--ff-playfair', preload: false })
const robotoSlab = Roboto_Slab({ subsets: ['latin', 'latin-ext'], variable: '--ff-roboto-slab', preload: false })
const cairo = Cairo({ subsets: ['arabic', 'latin', 'latin-ext'], variable: '--ff-cairo', preload: false })
const amiri = Amiri({ subsets: ['arabic', 'latin', 'latin-ext'], weight: ['400', '700'], variable: '--ff-amiri', preload: false })

/** Put on <html>: declares every `--ff-*` variable. */
export const fontVariables = [
  publicSans, lora, inter, poppins, montserrat, nunito, openSans, merriweather, playfair, robotoSlab, cairo, amiri,
].map((f) => f.variable).join(' ')

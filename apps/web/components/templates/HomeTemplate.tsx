import { Hero, OrderedSections, QuickDonateBand, type HomeData } from '../sections/HomeSections'

/**
 * Home page templates. All three share the sections; each has its own cover slider
 * and look (see the `tpl-*` rules in globals.css and the template switches in HomeSections):
 *  - klasik:   full-width slider with slide tabs, quick donation band right under it
 *  - kategori: centred fading slider, bold sans-serif headings, coloured bands
 *  - sade:     light split slider (text beside the image), airy campaign-first layout
 */
export function HomeTemplate({ data }: { data: HomeData }) {
  const template = data.site.template
  return (
    <>
      <Hero data={data} variant={template} />
      {template !== 'klasik' && <QuickDonateBand data={data} />}
      <OrderedSections data={data} />
    </>
  )
}

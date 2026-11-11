import { parseCart, addToCart, cartTotal, updateCartAmount } from './cart.mjs'
import { campaignFor } from './catalog.mjs'

const site = document.body.dataset.site
const key = `einfak:v3:preview-cart:${site}`
let cart = []
let storageAvailable = true
try { cart = parseCart(site,localStorage.getItem(key)) } catch { storageAvailable = false }

function persist() {
  try { localStorage.setItem(key,JSON.stringify(cart)); return true } catch { storageAvailable = false; return false }
}
function node(tag, text, className) {
  const element = document.createElement(tag)
  if (text !== undefined) element.textContent = text
  if (className) element.className = className
  return element
}
function render() {
  document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = String(cart.length) })
  const checkout = document.querySelector('[data-checkout-link]')
  if (checkout) checkout.hidden = !cart.length
  const view = document.querySelector('[data-cart-view]')
  if (!view) return
  view.replaceChildren()
  if (!cart.length) { view.append(node('p','Sepetiniz henüz boş. Destek vermek istediğiniz projeyi seçerek başlayın.','empty')); return }
  for (const [index,row] of cart.entries()) {
    const c = campaignFor(site,row.id)
    const wrapper = node('article',undefined,'cart-row')
    const details = node('div')
    details.append(node('h3',c.title),node('span','Örnek proje · '+ c.category,'muted'))
    const remove = node('button','Kaldır')
    remove.type = 'button'
    remove.setAttribute('aria-label',`${c.title} kalemini kaldır`)
    const feedback = node('p')
    feedback.setAttribute('role','status')
    const editor = node('form')
    const label = node('label','Destek tutarı (TL)')
    const input = node('input')
    input.type = 'text'
    input.inputMode = 'decimal'
    input.value = (row.cents / 100).toFixed(2).replace('.',',')
    input.required = true
    label.append(input)
    const save = node('button','Tutarı güncelle')
    save.type = 'submit'
    editor.append(label,save,feedback)
    editor.addEventListener('submit',event => {
      event.preventDefault()
      const previous = cart
      try {
        cart = updateCartAmount(site,cart,index,input.value.trim())
        if (!persist()) { cart = previous; throw new Error('Değişiklik kaydedilemedi. Tarayıcı depolamasını kontrol edin.') }
        render()
      } catch(error) { feedback.textContent = error.message }
    })
    details.append(editor)
    remove.addEventListener('click',() => {
      const previous = cart
      cart = cart.filter((_,i) => i !== index)
      if (!persist()) { cart = previous; feedback.textContent = 'Kalem kaldırılamadı. Tarayıcı depolamasını kontrol edin.'; return }
      render()
    })
    wrapper.append(details,node('strong',(row.cents/100).toLocaleString('tr-TR',{minimumFractionDigits:2})+' TL'),remove)
    view.append(wrapper)
  }
  const summary = node('div',undefined,'summary')
  const total = node('div',undefined,'summary-total')
  total.append(node('span','Toplam destek'),node('strong',(Number(cartTotal(site,cart))/100).toLocaleString('tr-TR',{minimumFractionDigits:2})+' TL'))
  summary.append(total,node('p','Bu bir deneme sepetidir; ödeme veya bağış kaydı oluşturulmaz.','muted'))
  view.append(summary)
}

document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click',() => {
  button.closest('form').elements.amount.value = button.dataset.amount
}))
document.querySelectorAll('[data-add-cart]').forEach(formElement => formElement.addEventListener('submit',event => {
  event.preventDefault()
  const form = event.currentTarget
  const status = form.querySelector('[data-add-status]')
  try {
    if (!storageAvailable) throw new Error('Tarayıcı depolaması kullanılamıyor. Sepeti denemek için bu siteye depolama izni verin.')
    const next = addToCart(site,cart,form.dataset.campaign || form.elements.campaign?.value,form.elements.amount.value.trim())
    const previous = cart
    cart = next
    if (!persist()) { cart = previous; throw new Error('Sepet kaydedilemedi. Tarayıcı depolama ayarlarını kontrol edin.') }
    status.textContent = 'Örnek sepetinize eklendi. Farklı projeler ekleyebilir veya sepetinizi inceleyebilirsiniz.'
    render()
  } catch(error) { status.textContent = error.message }
}))
window.addEventListener('storage',event => {
  if (event.key === key || event.key === null) { cart = parseCart(site,event.newValue); render() }
})
render()

document.querySelectorAll('[data-slider]').forEach(slider => {
  const track = slider.querySelector('[data-track]')
  const slides = [...slider.querySelectorAll('[data-slide]')]
  const position = slider.querySelector('[data-position]')
  let index = 0
  const go = step => {
    index = (index + step + slides.length) % slides.length
    track.scrollTo({left:slides[index].offsetLeft - slides[0].offsetLeft,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})
  }
  slider.querySelector('[data-prev]').addEventListener('click',() => go(-1))
  slider.querySelector('[data-next]').addEventListener('click',() => go(1))
  track.addEventListener('keydown',event => {
    if (event.target !== track || !['ArrowLeft','ArrowRight'].includes(event.key)) return
    event.preventDefault(); go(event.key === 'ArrowRight' ? 1 : -1)
  })
  track.addEventListener('scroll',() => {
    index = slides.reduce((best,slide,i) => Math.abs(slide.offsetLeft-slides[0].offsetLeft-track.scrollLeft) < Math.abs(slides[best].offsetLeft-slides[0].offsetLeft-track.scrollLeft) ? i : best,0)
    position.textContent = `${index+1} / ${slides.length}`
  },{passive:true})
})

const status=document.querySelector('[data-status]')
async function api(path,body) {
 const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
 const data=await response.json()
 if(!response.ok) {if(response.status===401 && !document.querySelector('[data-login]')) location.replace('/giris');throw new Error(data.message || 'İşlem tamamlanamadı.')}
 return data
}
document.querySelector('[data-login]')?.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true
 try {await api('/auth/login',{email:form.elements.email.value,password:form.elements.password.value});form.elements.password.value='';location.replace('/panel')}
 catch(error){status.textContent=error.message;form.elements.password.value=''}finally{button.disabled=false}
})
document.querySelector('[data-logout]')?.addEventListener('click',async()=>{try{await api('/auth/logout',{});location.replace('/giris')}catch(error){status.textContent=error.message}})
const organizations=document.querySelector('[data-organizations]')
if(organizations) {
 let offset=0,sequence=0
 const view=document.querySelector('[data-donations]'),prev=document.querySelector('[data-prev]'),next=document.querySelector('[data-next]')
 const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el}
 async function refresh(){
  const request=++sequence;view.replaceChildren();prev.disabled=next.disabled=true;status.textContent='Bağışlar yükleniyor…'
  try {
   const data=await api(`/api/admin/donations?organizationId=${encodeURIComponent(organizations.value)}&limit=25&offset=${offset}`)
   if(request!==sequence)return
   status.textContent=data.donations.length?`${offset+1}–${offset+data.donations.length} arası kayıtlar`:'Bu kurumda bu sayfa için bağış kaydı yok.'
   for(const row of data.donations){const card=node('article','');card.className='module-card';const cents=BigInt(row.amount_cents);card.append(node('h3',row.campaign_title),node('p',`${cents/100n},${String(cents%100n).padStart(2,'0')} ${row.currency}`),node('p',`Makbuz: ${row.receipt_number}`),node('p',`Ödeme durumu: ${row.payment_state}`));view.append(card)}
   prev.disabled=offset===0;next.disabled=data.donations.length<25
  }catch(error){if(request===sequence)status.textContent=error.message}
 }
 organizations.addEventListener('change',()=>{offset=0;refresh()})
 prev.addEventListener('click',()=>{offset=Math.max(0,offset-25);refresh()})
 next.addEventListener('click',()=>{offset+=25;refresh()})
 try {const data=await api('/api/session');for(const m of data.memberships){const option=node('option',`${m.name} · ${m.role}`);option.value=m.organizationId;organizations.append(option)}if(data.memberships.length)await refresh();else{organizations.disabled=true;status.textContent='Aktif kurum yetkiniz bulunmuyor. Kurum yöneticinizle iletişime geçin.'}}catch(error){status.textContent=error.message}
}

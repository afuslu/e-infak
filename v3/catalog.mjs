// Editorial examples for the local preview, never published campaigns.
export const campaigns = [
  { id: 'hafizlik', site: 'hicret', category: 'Eğitim', title: 'Bir hafızın yolculuğuna eşlik edin', summary: 'İlimle, emekle ve sabırla büyüyen bir yolculuk. Öğrencilerin eğitim ihtiyaçları için destek alanı.', image: '/media/hicret-class', amount: '500', icon: '▤' },
  { id: 'kitap', site: 'hicret', category: 'Eğitim', title: 'Bir kitap, yeni bir ufuk', summary: 'Kitap ve eğitim materyalleri için hazırlanan örnek destek projesi.', image: '/media/hicret-book', amount: '250', icon: '▥' },
  { id: 'talebe', site: 'hicret', category: 'Öğrenci', title: 'Talebenin yanında olun', summary: 'Öğrencilerin günlük ihtiyaçları ve eğitim hayatına katkı sunmayı amaçlayan örnek proje.', image: '/media/hicret-students', amount: '1000', icon: '◈' },
  { id: 'sofra', site: 'kardeslik', category: 'Gıda', title: 'Bir sofrada sizin de payınız olsun', summary: 'Temel gıda ihtiyaçları için dayanışma. Bir ailenin sofrasına uzanan iyiliği birlikte büyütelim.', image: '', amount: '500', icon: '◡' },
  { id: 'su', site: 'kardeslik', category: 'Su', title: 'Bir damla, bin umut', summary: 'Temiz suya erişim için hazırlanan örnek destek alanı. Küçük katkılar ortak bir amaca dönüşür.', image: '', amount: '250', icon: '◒' },
  { id: 'egitim', site: 'kardeslik', category: 'Eğitim', title: 'Geleceğe bir çanta dolusu umut', summary: 'Kırtasiye ve eğitim ihtiyaçları için hazırlanan örnek dayanışma projesi.', image: '', amount: '750', icon: '▧' },
  { id: 'dayanisma', site: 'kardeslik', category: 'Genel', title: 'İyiliğin ihtiyaç duyulduğu yere', summary: 'Kurum tarafından belirlenecek ihtiyaç alanlarına yönelik genel destek örneği.', image: '', amount: '100', icon: '✳' },
]

const additional = [
  ['zekat','Zekât','Zekât desteği','500','◇'],
  ['sadaka','Sadaka','İyiliğe bir sadaka','100','♡'],
  ['kurban','Kurban','Adak ve akika kurban desteği','1000','◈'],
  ['iftar','Gıda','Bir iftar sofrası paylaşın','250','◡'],
  ['kumanya','Gıda','Bir aileye gıda desteği','750','▣'],
  ['yetim','Yetim','Bir çocuğun yanında olun','500','♡'],
  ['kuran','Eğitim','Kur’an-ı Kerim hediye edin','200','▤'],
  ['medrese','Kalıcı Eser','Eğitim mekânlarına destek','1000','⌂'],
  ['acil','Acil Yardım','Zor zamanda dayanışma','250','✳'],
  ['kis','Acil Yardım','Kışa sıcak bir destek','500','❋'],
  ['su-destegi','Su','Temiz suya bir katkı','250','◒'],
]
for (const site of ['hicret','kardeslik']) {
  for (const [id,category,title,amount,icon] of additional) campaigns.push({
    id,site,category,title,amount,icon,image:'',
    summary:`${category} alanında hazırlanan örnek bağış kalemi. Kapsam ve uygulama koşulları kurum onayından sonra yayımlanacaktır.`,
  })
}

export function campaignFor(site, id) {
  return campaigns.find(c => c.site === site && c.id === id)
}

export const pages = {
  hakkimizda: ['Hakkımızda', 'Birlikte daha anlamlı.', 'Kurumun kuruluş hikâyesi, misyonu ve yönetim bilgileri doğrulanmış içeriklerle burada yayımlanacak.'],
  seffaflik: ['Şeffaflık', 'Güven, açıklıkla başlar.', 'Tüzük, faaliyet raporları, denetim belgeleri ve yardım toplama izinleri kurum onayıyla yayımlanacak.'],
  'banka-hesaplari': ['Banka hesapları', 'Desteğiniz doğru adrese ulaşsın.', 'Kurum tarafından doğrulanmış banka, alıcı ve IBAN bilgileri henüz eklenmedi. Bu önizleme üzerinden havale yapmayın.'],
  iletisim: ['İletişim', 'Sizi dinlemek isteriz.', 'Doğrulanmış telefon, e-posta ve adres bilgileri henüz yayımlanmadı.'],
  gonullu: ['Gönüllülük', 'İyiliğe zaman ayırın.', 'Eğitim, saha ve organizasyon çalışmalarına katılım bilgileri kurum tarafından yayımlanacak. Başvuru alımı henüz başlamadı.'],
  faaliyetler: ['Faaliyetler', 'İyiliğin izini birlikte sürelim.', 'Tamamlanan çalışmalar, saha notları ve faaliyet raporları bu bölümde yayımlanacak. Henüz yayımlanmış faaliyet yok.'],
  egitim: ['Eğitim programları', 'İlimle yetişen bir gelecek.', 'Program içeriği, yaş grupları, başvuru koşulları ve kayıt takvimi kurum onayından sonra yayımlanacak.'],
  kvkk: ['Kişisel veriler', 'Bilgileriniz sizin kontrolünüzde.', 'Bu geliştirme sürümünde kişisel bilgi istenmez. Onaylı aydınlatma metni ve veri işleme koşulları gerçek başvurular açılmadan önce yayımlanacaktır.'],
  'bagis-kosullari': ['Bağış ve iade koşulları', 'Her adım açık olsun.', 'Bu sürüm ödeme kabul etmez. Bağışın kullanımı, iptal ve iade süreçleri kurumun onaylı koşullarıyla yayına alınacaktır.'],
}

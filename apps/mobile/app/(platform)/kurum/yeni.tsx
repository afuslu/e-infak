import React, { useState } from 'react';
import { Href, Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pf } from '@/lib/api';
import { Btn, Chips, Field, Notice, Screen, SectionTitle } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';

type Catalog = {
  plans: { key: string; label: string }[];
  base_domain: string;
};

export default function NewOrganizationScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: ['platform', 'catalog'],
    queryFn: () => pf<Catalog>('/catalog'),
  });

  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [plan, setPlan] = useState('ileri');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !subdomain.trim() || !email.trim() || !adminEmail.trim() || !adminFirstName.trim()) {
      return setError('Kurum adı, alt alan adı, kurum e-postası ve yönetici bilgileri zorunludur.');
    }
    setBusy(true);
    try {
      const created = await pf<{
        id?: string;
        organization?: { id: string };
        admin?: { email: string; temporary_password?: string };
      }>('/organizations', {
        method: 'POST',
        body: {
          name: name.trim(),
          subdomain: subdomain.trim().toLowerCase(),
          email: email.trim(),
          phone: phone.trim() || null,
          city: city.trim() || null,
          plan,
          admin_first_name: adminFirstName.trim(),
          admin_last_name: adminLastName.trim(),
          admin_email: adminEmail.trim(),
          ...(adminPassword.trim() ? { admin_password: adminPassword.trim() } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] });
      await queryClient.invalidateQueries({ queryKey: ['platform', 'metrics'] });
      const orgId = created.organization?.id || created.id;
      const tempPw = created.admin?.temporary_password;
      notify(tempPw ? `Kurum açıldı. Yönetici şifresi: ${tempPw}` : 'Yeni kurum oluşturuldu.');
      if (orgId) {
        router.replace(`/kurum/${orgId}` as Href);
      } else {
        router.back();
      }
    } catch (e: any) {
      setError(e?.message || 'Kurum oluşturulamadı.');
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Btn title="Kurumu Oluştur" onPress={submit} loading={busy} />}>
      <Stack.Screen options={{ title: 'Yeni Kurum Aç' }} />
      {error ? <Notice text={error} tone="danger" /> : null}

      <SectionTitle>Kurum Bilgileri</SectionTitle>
      <Field label="Kurum Adı" value={name} onChangeText={setName} placeholder="Örnek İyilik Derneği" />
      <Field
        label="Alt Alan Adı (Subdomain)"
        value={subdomain}
        onChangeText={setSubdomain}
        autoCapitalize="none"
        placeholder="ornekdernek"
        hint={catalog.data?.base_domain ? `Adres: ${subdomain || 'ornekdernek'}.${catalog.data.base_domain}` : undefined}
      />
      <Field label="Kurum E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="bilgi@kurum.org" />
      <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />
      <Field label="Şehir" value={city} onChangeText={setCity} placeholder="İstanbul" />

      <SectionTitle>Paket</SectionTitle>
      <Chips
        options={(catalog.data?.plans || [
          { key: 'baslangic', label: 'Başlangıç' },
          { key: 'orta', label: 'Orta' },
          { key: 'ileri', label: 'İleri' },
        ]).map((p) => ({ value: p.key, label: p.label }))}
        value={plan}
        onChange={setPlan}
        wrap
      />

      <SectionTitle>İlk Yönetici</SectionTitle>
      <Field label="Yönetici Adı" value={adminFirstName} onChangeText={setAdminFirstName} placeholder="Ahmet" />
      <Field label="Yönetici Soyadı" value={adminLastName} onChangeText={setAdminLastName} placeholder="Yılmaz" />
      <Field label="Yönetici E-posta" value={adminEmail} onChangeText={setAdminEmail} autoCapitalize="none" keyboardType="email-address" placeholder="yonetici@kurum.org" />
      <Field label="İlk Şifre (isteğe bağlı)" value={adminPassword} onChangeText={setAdminPassword} secureTextEntry placeholder="Boş bırakılırsa otomatik üretilir" />
    </Screen>
  );
}

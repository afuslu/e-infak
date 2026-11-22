import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MessageSquarePlus } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { df } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Badge, Btn, Card, Chips, Field, Screen, SectionTitle, Sheet, SwitchRow, useUi } from '@/components/ui';
import { notify, notifyError } from '@/components/toast';
import { space, useTheme } from '@/theme';

type DonorRequestItem = {
  id: string;
  message: string;
  is_read: boolean;
  status: 'open' | 'reviewed' | string;
  created_at: string;
};

type ReqCategory = 'makbuz' | 'kurban' | 'kuyu' | 'diger';

export default function DonorSettingsScreen() {
  const { donorMe, reload, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const ui = useUi();

  const [firstName, setFirstName] = useState(donorMe?.first_name || '');
  const [lastName, setLastName] = useState(donorMe?.last_name || '');
  const [email, setEmail] = useState(donorMe?.email || '');
  const [city, setCity] = useState(donorMe?.city || '');
  const [address, setAddress] = useState(donorMe?.address || '');
  const [tcNo, setTcNo] = useState(donorMe?.tc_no || '');
  const [allowSms, setAllowSms] = useState(!!donorMe?.allow_sms);
  const [allowEmail, setAllowEmail] = useState(!!donorMe?.allow_email);
  const [isAnonymous, setIsAnonymous] = useState(!!donorMe?.is_anonymous);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqCategory, setReqCategory] = useState<ReqCategory>('diger');
  const [reqMessage, setReqMessage] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  useEffect(() => {
    if (donorMe) {
      setFirstName(donorMe.first_name || '');
      setLastName(donorMe.last_name || '');
      setEmail(donorMe.email || '');
      setCity(donorMe.city || '');
      setAddress(donorMe.address || '');
      setTcNo(donorMe.tc_no || '');
      setAllowSms(!!donorMe.allow_sms);
      setAllowEmail(!!donorMe.allow_email);
      setIsAnonymous(!!donorMe.is_anonymous);
    }
  }, [donorMe]);

  const requests = useQuery({
    queryKey: ['donor', 'requests'],
    queryFn: () => df<DonorRequestItem[]>('/me/requests'),
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      df('/me/profile', {
        method: 'PATCH',
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          city: city.trim(),
          address: address.trim(),
          tc_no: tcNo.trim(),
          allow_sms: allowSms,
          allow_email: allowEmail,
          is_anonymous: isAnonymous,
        },
      }),
    onSuccess: async () => {
      await reload();
      notify('Profil bilgileriniz kaydedildi.');
    },
    onError: notifyError,
  });

  const savePassword = useMutation({
    mutationFn: () => {
      if (newPassword.length < 6) throw new Error('Şifre en az 6 karakter olmalıdır.');
      if (newPassword !== newPasswordConfirm) throw new Error('Şifreler eşleşmiyor.');
      return df('/me/password', {
        method: 'POST',
        body: { new_password: newPassword },
      });
    },
    onSuccess: async () => {
      setNewPassword('');
      setNewPasswordConfirm('');
      await reload();
      notify('Şifreniz kaydedildi. Artık şifreyle de giriş yapabilirsiniz.');
    },
    onError: notifyError,
  });

  const sendRequest = useMutation({
    mutationFn: () => {
      if (reqMessage.trim().length < 5) throw new Error('Lütfen talebinizi en az 5 karakter olarak yazın.');
      return df('/me/requests', {
        method: 'POST',
        body: { category: reqCategory, message: reqMessage.trim() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor', 'requests'] });
      setReqOpen(false);
      setReqMessage('');
      notify('Talebiniz dernek yetkililerine iletildi.');
    },
    onError: notifyError,
  });

  return (
    <Screen onRefresh={() => { reload(); requests.refetch(); }} refreshing={requests.isRefetching}>
      <SectionTitle>KİŞİSEL BİLGİLERİM</SectionTitle>
      <Card>
        <Field label="Ad" value={firstName} onChangeText={setFirstName} />
        <Field label="Soyad" value={lastName} onChangeText={setLastName} />
        <Field label="Telefon" value={donorMe?.phone || '—'} editable={false} />
        <Field label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label="T.C. Kimlik No (İsteğe Bağlı)" value={tcNo} onChangeText={setTcNo} keyboardType="number-pad" maxLength={11} />
        <Field label="Şehir" value={city} onChangeText={setCity} />
        <Field label="Adres" value={address} onChangeText={setAddress} multiline />
      </Card>

      <SectionTitle>İLETİŞİM TERCİHLERİM</SectionTitle>
      <Card>
        <SwitchRow label="SMS Bildirimleri" hint="Kurban kesim bilgisi ve makbuz SMS'leri" value={allowSms} onValueChange={setAllowSms} />
        <SwitchRow label="E-posta Bildirimleri" hint="Faaliyet bülteni ve e-makbuz" value={allowEmail} onValueChange={setAllowEmail} />
        <SwitchRow label="İsmim Gizli Kalsın" hint="Hayırsever listelerinde adınız gizlenir" value={isAnonymous} onValueChange={setIsAnonymous} />
        <Btn title="Bilgilerimi Kaydet" loading={saveProfile.isPending} onPress={() => saveProfile.mutate()} />
      </Card>

      <SectionTitle>{donorMe?.has_password ? 'ŞİFRE DEĞİŞTİR' : 'ŞİFRE BELİRLE (İSTEĞE BAĞLI)'}</SectionTitle>
      <Card>
        <Text style={ui.muted}>
          {donorMe?.has_password
            ? 'Şifrenizi güncellediğinizde SMS kodu beklemeden telefon/e-posta ve şifrenizle giriş yapabilirsiniz.'
            : 'Bir şifre belirlerseniz sonraki girişlerinizde SMS kodu beklemeden doğrudan şifrenizle giriş yapabilirsiniz.'}
        </Text>
        <Field label="Yeni Şifre (En az 6 karakter)" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
        <Field label="Yeni Şifre (Tekrar)" value={newPasswordConfirm} onChangeText={setNewPasswordConfirm} secureTextEntry />
        <Btn
          title={donorMe?.has_password ? 'Şifremi Güncelle' : 'Şifre Belirle'}
          variant="outline"
          loading={savePassword.isPending}
          onPress={() => savePassword.mutate()}
        />
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionTitle>DESTEK & DÜZELTME TALEPLERİM</SectionTitle>
        <Btn
          title="Talep İlet"
          variant="outline"
          small
          icon={<MessageSquarePlus size={16} color={colors.primaryDark} />}
          onPress={() => setReqOpen(true)}
        />
      </View>

      {(requests.data?.length || 0) > 0 ? (
        <View style={{ gap: space.sm }}>
          {requests.data!.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={ui.muted}>{dateTime(r.created_at)}</Text>
                <Badge label={r.is_read ? 'İncelendi' : 'İletildi'} tone={r.is_read ? 'ok' : 'info'} />
              </View>
              <Text style={ui.text}>{r.message}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      <Btn
        title="Oturumu Kapat"
        variant="danger"
        icon={<LogOut size={18} color={colors.danger} />}
        onPress={() => signOut()}
      />

      <Sheet
        visible={reqOpen}
        onClose={() => setReqOpen(false)}
        title="Destek / Düzeltme Talebi"
        footer={<Btn title="Talebi Gönder" loading={sendRequest.isPending} onPress={() => sendRequest.mutate()} />}
      >
        <Text style={ui.muted}>Konu</Text>
        <Chips<ReqCategory>
          options={[
            { value: 'makbuz', label: 'Makbuz Düzeltme' },
            { value: 'kurban', label: 'Kurban Hisse / İsim' },
            { value: 'kuyu', label: 'Su Kuyusu Tabelası' },
            { value: 'diger', label: 'Genel Talep' },
          ]}
          value={reqCategory}
          onChange={setReqCategory}
          wrap
        />
        <Field
          label="Mesajınız"
          value={reqMessage}
          onChangeText={setReqMessage}
          multiline
          placeholder="Talebinizi detaylıca yazabilirsiniz..."
        />
      </Sheet>
    </Screen>
  );
}

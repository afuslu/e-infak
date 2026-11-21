import React from 'react';
import { Field } from './ui';
import { isoToTrDate, trDateToIso } from '@/lib/format';

/** GG.AA.YYYY biçiminde tarih girişi; değer ISO (YYYY-MM-DD) olarak tutulur. */
export function DateField({ label, value, onChange, hint }: {
  label: string; value: string | null; onChange: (iso: string | null) => void; hint?: string;
}) {
  const [text, setText] = React.useState(isoToTrDate(value));
  React.useEffect(() => {
    if ((trDateToIso(text) || null) !== (value || null)) setText(isoToTrDate(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // Yazım sürerken (8 rakam tamamlanmadan) hata gösterilmez.
  const invalid = text.length === 10 && !trDateToIso(text);
  return (
    <Field
      label={label}
      value={text}
      placeholder="GG.AA.YYYY"
      keyboardType="number-pad"
      maxLength={10}
      hint={hint}
      error={invalid ? 'Tarihi GG.AA.YYYY biçiminde yazın.' : null}
      onChangeText={(next) => {
        // Yalnızca rakamlar tutulur, noktalar GG.AA.YYYY düzenine göre eklenir.
        const d = next.replace(/\D/g, '').slice(0, 8);
        const t = d.length > 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}.${d.slice(2)}` : d;
        setText(t);
        onChange(trDateToIso(t));
      }}
    />
  );
}

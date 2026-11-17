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
  const invalid = !!text && !trDateToIso(text);
  return (
    <Field
      label={label}
      value={text}
      placeholder="GG.AA.YYYY"
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      hint={hint}
      error={invalid ? 'Tarihi GG.AA.YYYY biçiminde yazın.' : null}
      onChangeText={(next) => {
        // Rakam yazıldıkça noktaları kendiliğinden ekler.
        let t = next.replace(/[^\d.]/g, '');
        if (t.length > text.length && /^\d{2}$|^\d{2}\.\d{2}$/.test(t)) t += '.';
        setText(t);
        onChange(trDateToIso(t));
      }}
    />
  );
}

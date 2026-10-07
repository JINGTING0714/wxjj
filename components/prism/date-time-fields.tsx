'use client';
import { useState } from 'react';

export function DateTimeFields({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  const date = value.slice(0, 10);
  const rawTime = value.slice(11, 19);
  const time = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
  const [edit, setEdit] = useState({ time, draft: time });
  if (edit.time !== time) setEdit({ time, draft: time });
  const draft = edit.time === time ? edit.draft : time;
  const setDraft = (draft: string) => setEdit({ time, draft });
  return <fieldset className={`date-time-fields ${compact ? 'is-compact' : ''}`}><legend>{label}</legend><div>
    <label><span className={compact ? 'sr-only' : undefined}>日期</span><input type="date" aria-label={`${label}日期`} value={date} onChange={event => onChange(event.target.value ? `${event.target.value}T${time || '00:00:00'}` : '')} /></label>
    <label><span className={compact ? 'sr-only' : undefined}>时分秒</span><input type="text" aria-label={`${label}时分秒`} inputMode="text" placeholder="22:15:00" maxLength={8} value={draft} onChange={event => {
      const next = event.target.value; setDraft(next);
      if (/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(next) && date) onChange(`${date}T${next}`);
    }} onBlur={() => {
      const match = draft.match(/^(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?$/);
      if (match && Number(match[1]) < 24 && Number(match[2]) < 60 && Number(match[3] || 0) < 60) {
        const next = `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}:${(match[3] || '00').padStart(2, '0')}`;
        setDraft(next); if (date) onChange(`${date}T${next}`);
      } else setDraft(time);
    }} /></label>
  </div>{!compact && <small>直接填写，例如 22:15:00，精确到秒。</small>}</fieldset>;
}

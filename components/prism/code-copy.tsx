'use client';
import { useEffect, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { formatProfileCode } from '@/lib/short-codes';
export type CodeFormat = 'profile' | 'raw';
export function rawProfileCodes(value: string) {
  return value
    .trim()
    .replace(/--profile\s+/gi, '')
    .trim();
}
export function useCodeFormat(initial: CodeFormat = 'profile') {
  const [format, setFormat] = useState<CodeFormat>(() =>
    typeof window === 'undefined'
      ? initial
      : localStorage.getItem('prism-copy-format') === 'raw'
        ? 'raw'
        : localStorage.getItem('prism-copy-format') === 'profile'
          ? 'profile'
          : initial,
  );
  useEffect(() => {
    const changed = (event: Event) =>
      setFormat((event as CustomEvent<CodeFormat>).detail);
    window.addEventListener('prism:copy-format', changed);
    return () => window.removeEventListener('prism:copy-format', changed);
  }, []);
  const change = (next: CodeFormat) => {
    setFormat(next);
    localStorage.setItem('prism-copy-format', next);
    window.dispatchEvent(
      new CustomEvent('prism:copy-format', { detail: next }),
    );
  };
  return { format, change };
}
export function CodeCopy({
  value,
  initial = 'profile',
  label = '短码',
}: {
  value: string;
  initial?: CodeFormat;
  label?: string;
}) {
  const { format, change } = useCodeFormat(initial);
  return (
    <span className="code-copy-control">
      <select
        aria-label={`${label}复制格式`}
        value={format}
        onChange={(event) => change(event.target.value as CodeFormat)}
      >
        <option value="profile">带 --profile</option>
        <option value="raw">仅短码</option>
      </select>
      <button
        type="button"
        className="visible-copy-action"
        disabled={!value.trim()}
        onClick={() =>
          void copyText(
            format === 'profile'
              ? formatProfileCode(rawProfileCodes(value))
              : rawProfileCodes(value),
          )
        }
      >
        {format === 'profile' ? '复制 Profile 参数' : '复制短码'}
      </button>
    </span>
  );
}

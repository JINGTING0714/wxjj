'use client';
import { useEffect, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { formatProfileCode } from '@/lib/short-codes';
import { Copy, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
      <button
        type="button"
        className="visible-copy-action"
        aria-label={format === 'profile' ? '复制 Profile 参数' : '复制短码'}
        disabled={!value.trim()}
        onClick={() =>
          void copyText(
            format === 'profile'
              ? formatProfileCode(rawProfileCodes(value))
              : rawProfileCodes(value),
          )
        }
      >
        <Copy aria-hidden="true" />
        <span>复制</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="copy-format-trigger"
          aria-label={`${label}复制格式`}
          title="选择复制格式"
        >
          <span>{format === 'profile' ? '参数' : '短码'}</span>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="copy-format-menu">
          <DropdownMenuItem onClick={() => change('profile')}>
            <span>带 --profile</span>
            {format === 'profile' && <Check />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => change('raw')}>
            <span>仅短码</span>
            {format === 'raw' && <Check />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

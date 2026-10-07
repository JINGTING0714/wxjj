'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { calculatorExpression, calculatorInitial, calculatorKey } from '@/lib/calculator';
import { SectionHead } from './studio-shared';
const keys = [
  'AC',
  '±',
  '⌫',
  '÷',
  '7',
  '8',
  '9',
  '×',
  '4',
  '5',
  '6',
  '−',
  '1',
  '2',
  '3',
  '+',
  '0',
  '.',
  '=',
];
export function CalculatorPanel({ compact = false, onUse, canUse = false }: { compact?: boolean; onUse?: (value: string) => void; canUse?: boolean }) {
  const [state, setState] = useState(calculatorInitial);
  const [draft, setDraft] = useState('');
  const press = (key: string) => {
    if (key === 'AC') { setDraft(''); setState(calculatorInitial()); return; }
    if (draft) {
      if (key === '=') { setState(calculatorExpression(draft)); setDraft(''); }
      else if (key === '⌫') setDraft(value => value.slice(0, -1));
      else if (key === '±') setDraft(value => `-(${value})`);
      else setDraft(value => value + key);
    } else setState(current => calculatorKey(current, key));
  };
  return (
    <div className={compact ? 'calculator-compact' : 'studio-page'}>
      {!compact && <SectionHead
        eyebrow="QUICK CALCULATOR"
        number="11"
        title="计算器"
        description="简单计算，手动确认。计算结果不会自动创建账目。"
      />}
      <section className="prism-calculator" aria-label="简易计算器" tabIndex={0} onKeyDown={event => {
        if (event.target instanceof HTMLInputElement) return;
        const mapping: Record<string, string> = { Enter: '=', Escape: 'AC', Backspace: '⌫', '*': '×', '/': '÷', '-': '−' };
        const key = mapping[event.key] || event.key;
        if (keys.includes(key)) { event.preventDefault(); press(key); }
      }}>
        <label className="calculator-expression"><span>输入算式</span><input type="text" inputMode="text" aria-label="输入算式" placeholder="例如 15×3+4，按回车或等号计算" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); press('='); } else if (event.key === 'Escape') { event.preventDefault(); press('AC'); } }} /></label>
        <small>
          {state.expression || '先乘除，后加减 · 支持键盘输入'}
        </small>
        <output aria-live="polite">{state.display}</output>
        <div>
          {keys.map((key) => (
            <Button
              key={key}
              type="button"
              className={key === '=' ? 'calculator-equal' : ''}
              variant={
                ['+', '−', '×', '÷', '='].includes(key) ? 'default' : 'outline'
              }
              aria-label={
                key === '⌫'
                  ? '退格'
                  : key === '±'
                    ? '正负号'
                    : key === 'AC'
                      ? '清除'
                      : key
              }
              onClick={() => press(key)}
            >
              {key}
            </Button>
          ))}
        </div>
        {onUse && <Button type="button" className="calculator-use" disabled={!canUse || !Number.isFinite(Number(state.display))} onClick={() => { const calculated = draft ? calculatorExpression(draft) : state.tokens?.length ? calculatorKey(state, '=') : state; setState(calculated); setDraft(''); if (!calculated.error) onUse(calculated.display); }} variant="outline">将结果填入当前金额草稿</Button>}
      </section>
    </div>
  );
}

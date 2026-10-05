'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { calculatorInitial, calculatorKey } from '@/lib/calculator';
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
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const keyDown = (event: KeyboardEvent) => {
      const mapping: Record<string, string> = {
        Enter: '=',
        Escape: 'AC',
        Backspace: '⌫',
        '*': '×',
        '/': '÷',
        '-': '−',
      };
      const key = mapping[event.key] || event.key;
      if (keys.includes(key)) {
        event.preventDefault();
        setState((current) => calculatorKey(current, key));
      }
    };
    element.addEventListener('keydown', keyDown);
    return () => element.removeEventListener('keydown', keyDown);
  }, []);
  return (
    <div className={compact ? 'calculator-compact' : 'studio-page'}>
      {!compact && <SectionHead
        eyebrow="QUICK CALCULATOR"
        number="11"
        title="计算器"
        description="简单计算，手动确认。计算结果不会自动创建账目。"
      />}
      <section ref={root} className="prism-calculator" aria-label="简易计算器">
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
              onClick={() => setState((current) => calculatorKey(current, key))}
            >
              {key}
            </Button>
          ))}
        </div>
        {onUse && <Button type="button" className="calculator-use" disabled={!canUse || !Number.isFinite(Number(state.display))} onClick={() => { const calculated = state.tokens?.length ? calculatorKey(state, '=') : state; setState(calculated); if (!calculated.error) onUse(calculated.display); }} variant="outline">将结果填入当前金额草稿</Button>}
      </section>
    </div>
  );
}

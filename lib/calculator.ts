export type CalculatorState = {
  display: string;
  stored?: number;
  operator?: string;
  fresh: boolean;
  last?: { operator: string; value: number };
  error?: boolean;
};
export const calculatorInitial = (): CalculatorState => ({
  display: '0',
  fresh: true,
});
function result(a: number, operator: string, b: number) {
  if (operator === '÷' && b === 0) throw new Error('不能除以零');
  const value =
    operator === '+'
      ? a + b
      : operator === '−'
        ? a - b
        : operator === '×'
          ? a * b
          : a / b;
  if (!Number.isFinite(value) || Math.abs(value) >= 1e16)
    throw new Error('结果超出范围');
  return Number(value.toPrecision(12));
}
export function calculatorKey(
  state: CalculatorState,
  key: string,
): CalculatorState {
  if (key === 'AC') return calculatorInitial();
  if (state.error) state = calculatorInitial();
  if (/^\d$/.test(key))
    return {
      ...state,
      last: state.fresh && !state.operator ? undefined : state.last,
      display:
        state.fresh || state.display === '0'
          ? key
          : state.display.replace('-', '').length >= 16
            ? state.display
            : state.display + key,
      fresh: false,
    };
  if (key === '.')
    return {
      ...state,
      last: state.fresh && !state.operator ? undefined : state.last,
      display: state.fresh
        ? '0.'
        : state.display.includes('.')
          ? state.display
          : state.display + '.',
      fresh: false,
    };
  if (key === '±')
    return {
      ...state,
      display:
        Number(state.display) === 0
          ? state.display
          : state.display.startsWith('-')
            ? state.display.slice(1)
            : '-' + state.display,
      fresh: false,
    };
  if (key === '⌫')
    return {
      ...state,
      display: state.fresh
        ? '0'
        : state.display.length <= 1 ||
            (state.display.startsWith('-') && state.display.length === 2)
          ? '0'
          : state.display.slice(0, -1),
      fresh: false,
    };
  try {
    if (['+', '−', '×', '÷'].includes(key)) {
      const value =
        state.operator && state.stored !== undefined && !state.fresh
          ? result(state.stored, state.operator, Number(state.display))
          : Number(state.display);
      return {
        display: String(value),
        stored: value,
        operator: key,
        fresh: true,
      };
    }
    if (key === '=') {
      const operator = state.operator || state.last?.operator;
      const value = state.operator ? Number(state.display) : state.last?.value;
      if (!operator || value === undefined) return state;
      const computed = result(
        state.operator
          ? (state.stored ?? Number(state.display))
          : Number(state.display),
        operator,
        value,
      );
      return {
        display: String(computed),
        last: { operator, value },
        fresh: true,
      };
    }
    return state;
  } catch (error) {
    return {
      display: error instanceof Error ? error.message : '计算错误',
      fresh: true,
      error: true,
    };
  }
}

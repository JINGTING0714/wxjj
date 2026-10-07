export type CalculatorState = {
  display: string;
  tokens?: Array<string | number>;
  expression?: string;
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

/** Parse typed arithmetic without executing pasted code. */
export function calculatorExpression(raw: string): CalculatorState {
  try {
    const source = raw.normalize('NFKC').replace(/\s/g, '').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
    if (!source || source.length > 200 || !/^[\d.+*/()\-]+$/.test(source)) throw new Error('请输入数字和加减乘除算式');
    const tokens = source.match(/\d+(?:\.\d*)?|\.\d+|[()+*/\-]/g) || [];
    if (tokens.join('') !== source || tokens.length > 128) throw new Error('算式格式不正确');
    let index = 0;
    const atom = (depth: number): number => {
      if (depth > 20) throw new Error('括号层数过多');
      const token = tokens[index++];
      if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom(depth + 1);
      if (token === '(') { const value = sum(depth + 1); if (tokens[index++] !== ')') throw new Error('请补齐括号'); return value; }
      if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error('算式不完整');
      return Number(token);
    };
    const product = (depth: number): number => {
      let value = atom(depth);
      while (tokens[index] === '*' || tokens[index] === '/') { const operator = tokens[index++]; value = result(value, operator === '*' ? '×' : '÷', atom(depth)); }
      return value;
    };
    const sum = (depth: number): number => {
      let value = product(depth);
      while (tokens[index] === '+' || tokens[index] === '-') { const operator = tokens[index++]; value = result(value, operator === '-' ? '−' : '+', product(depth)); }
      return value;
    };
    const value = sum(0);
    if (index !== tokens.length || !Number.isFinite(value) || Math.abs(value) >= 1e16) throw new Error('请检查算式是否完整、数值是否过大');
    return { display: String(Number(value.toPrecision(12))), expression: `${raw.trim()} =`, fresh: true };
  } catch (reason) { return { display: reason instanceof Error ? reason.message : '计算错误', fresh: true, error: true }; }
}
const operators = ['+', '−', '×', '÷'];
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
/** Evaluate multiplication and division before addition and subtraction; never eval user input. */
export function evaluateCalculation(tokens: Array<string | number>): number {
  const terms: number[] = [Number(tokens[0])];
  const sums: string[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = String(tokens[i]),
      value = Number(tokens[i + 1]);
    if (!operators.includes(operator) || !Number.isFinite(value))
      throw new Error('算式不完整');
    if (operator === '×' || operator === '÷')
      terms[terms.length - 1] = result(terms.at(-1)!, operator, value);
    else {
      sums.push(operator);
      terms.push(value);
    }
  }
  return terms
    .slice(1)
    .reduce(
      (total, value, index) => result(total, sums[index], value),
      terms[0],
    );
}
export function calculatorKey(
  state: CalculatorState,
  key: string,
): CalculatorState {
  if (key === 'AC') return calculatorInitial();
  if (state.error) state = calculatorInitial();
  const tokens = state.tokens || [];
  if (/^\d$/.test(key) || key === '.') {
    const display = state.fresh
      ? key === '.'
        ? '0.'
        : key
      : key === '.'
        ? state.display.includes('.')
          ? state.display
          : state.display + '.'
        : state.display === '0'
          ? key
          : state.display.replace('-', '').length < 16
            ? state.display + key
            : state.display;
    return {
      ...state,
      display,
      fresh: false,
      expression: tokens.length ? tokens.join(' ') : '',
      last: undefined,
    };
  }
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
      display:
        state.fresh || state.display.length <= 1 || /^-\d$/.test(state.display)
          ? '0'
          : state.display.slice(0, -1),
      fresh: false,
    };
  try {
    if (operators.includes(key)) {
      const next =
        state.fresh && tokens.length
          ? [...tokens.slice(0, -1), key]
          : [...tokens, Number(state.display), key];
      return {
        display: state.display,
        tokens: next,
        expression: next.join(' '),
        operator: key,
        fresh: true,
      };
    }
    if (key === '=') {
      if (!tokens.length && state.last)
        return {
          ...state,
          display: String(
            result(
              Number(state.display),
              state.last.operator,
              state.last.value,
            ),
          ),
          fresh: true,
        };
      if (!tokens.length) return state;
      const next = [...tokens, Number(state.display)];
      return {
        display: String(evaluateCalculation(next)),
        expression: next.join(' ') + ' =',
        fresh: true,
        last: { operator: String(tokens.at(-1)), value: Number(state.display) },
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

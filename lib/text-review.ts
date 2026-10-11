export type TextChange = { kind: 'same' | 'added' | 'removed'; text: string };
const tokenize = (text: string) =>
  text.match(/--[A-Za-z]+\b|[A-Za-z][\w-]*|\d+(?:[.:/]\d+)*|\s+|[^\s]/gu) || [];
/** Bounded token diff: retain every character, and avoid quadratic work on long
 * pasted prompts. The original and proposed texts are always reconstructible. */
export function textChanges(before: string, after: string): TextChange[] {
  const a = tokenize(before),
    b = tokenize(after);
  let start = 0,
    end = 0;
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
  while (
    end < Math.min(a.length, b.length) - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const left = a.slice(start, a.length - end),
    right = b.slice(start, b.length - end),
    result: TextChange[] = [];
  const add = (kind: TextChange['kind'], text: string) => {
    if (!text) return;
    const last = result.at(-1);
    if (last?.kind === kind) last.text += text;
    else result.push({ kind, text });
  };
  add('same', a.slice(0, start).join(''));
  if (left.length * right.length > 160000) {
    add('removed', left.join(''));
    add('added', right.join(''));
  } else {
    const cols = right.length + 1,
      table = new Uint16Array((left.length + 1) * cols);
    for (let i = left.length - 1; i >= 0; i--)
      for (let j = right.length - 1; j >= 0; j--)
        table[i * cols + j] =
          left[i] === right[j]
            ? table[(i + 1) * cols + j + 1] + 1
            : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    let i = 0,
      j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        add('same', left[i++]);
        j++;
      } else if (
        j < right.length &&
        (i === left.length ||
          table[i * cols + j + 1] >= table[(i + 1) * cols + j])
      )
        add('added', right[j++]);
      else add('removed', left[i++]);
    }
  }
  add('same', end ? a.slice(-end).join('') : '');
  return result;
}
export type ReviewIssue = { text: string; message: string };
export function reviewIssues(text: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  for (const match of text.matchAll(/\p{Script=Han}[A-Z]\p{Script=Han}/gu))
    issues.push({
      text: match[0],
      message: '中文之间出现单个英文字母，请对照原图检查。',
    });
  for (const match of text.matchAll(
    /--(ar|stylize|chaos|weird|niji|seed|quality|q|v)\s+([^\s]+)/gi,
  )) {
    const name = match[1].toLowerCase(),
      value = match[2].replace(/[,，。;；]+$/, '');
    if (
      name === 'ar'
        ? !/^\d+(?:\.\d+)?[:：]\d+(?:\.\d+)?$/.test(value)
        : !/^\d+(?:\.\d+)?$/.test(value)
    )
      issues.push({
        text: match[0],
        message: '这个参数格式可能有误，请确认数字、冒号和字母。',
      });
  }
  for (const name of ['profile', 'ar', 'stylize', 'niji'])
    if ((text.match(new RegExp(`--${name}\\b`, 'gi')) || []).length > 1)
      issues.push({
        text: `--${name}`,
        message: '同一参数出现多次，请检查是否包含两个版本的提示词。',
      });
  return issues.slice(0, 12);
}

export type RushOrder = 'original' | 'nearest';

export type SaleMessage = {
  id: string;
  screenshot: number;
  order: number;
  buyer: string;
  time: string;
  text: string;
  ignored?: boolean;
};

export type SaleAssignment = {
  number: number;
  buyer: string;
  messageId: string;
  rush: boolean;
};

export type SaleIssue = {
  messageId: string;
  number?: number;
  reason: string;
};

export function extractSaleNumbers(text: string): number[] {
  return [...text.matchAll(/(?<!\d)\d+(?!\d)/g)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isSafeInteger(value));
}

export function reconcileSales(
  messages: SaleMessage[],
  validNumbers: Iterable<number>,
  startTime: string,
  rushOrder: RushOrder | 'exclude',
) {
  // Keep displayed precision, but normalize missing seconds and fractions for comparison.
  const comparableTime = (value: string) => {
    const seconds = value.length === 16 ? `${value}:00` : value;
    return seconds.includes('.') ? seconds : `${seconds}.000`;
  };
  const effectiveStart = comparableTime(startTime);
  const valid = new Set(validNumbers);
  const assigned = new Map<number, SaleAssignment>();
  const issues: SaleIssue[] = [];
  const ordered = messages
    .filter((message) => !message.ignored)
    .sort((a, b) => a.screenshot - b.screenshot || a.order - b.order);
  const normal: SaleMessage[] = [];
  const rush: SaleMessage[] = [];
  for (const message of ordered) {
    if (!message.buyer.trim() || !message.time.trim()) {
      issues.push({ messageId: message.id, reason: '昵称或时间待确认' });
      continue;
    }
    if (comparableTime(message.time) >= effectiveStart) normal.push(message);
    else rush.push(message);
  }
  const process = (message: SaleMessage, isRush: boolean) => {
    const numbers = extractSaleNumbers(message.text);
    if (!numbers.length)
      issues.push({ messageId: message.id, reason: '未识别到号码，请核对原消息' });
    for (const number of new Set(numbers)) {
      if (!valid.has(number)) {
        issues.push({ messageId: message.id, number, reason: '本轮号码不存在' });
      } else if (assigned.has(number)) {
        issues.push({ messageId: message.id, number, reason: '号码已被前面的有效消息占用' });
      } else {
        assigned.set(number, {
          number,
          buyer: message.buyer.trim(),
          messageId: message.id,
          rush: isRush,
        });
      }
    }
  };
  normal.forEach((message) => process(message, false));
  if (rushOrder !== 'exclude') {
    const post = rushOrder === 'nearest' ? [...rush].reverse() : rush;
    post.forEach((message) => process(message, true));
  }
  return {
    assignments: [...assigned.values()],
    issues,
    remaining: [...valid].filter((number) => !assigned.has(number)),
    rushCount: rush.length,
  };
}

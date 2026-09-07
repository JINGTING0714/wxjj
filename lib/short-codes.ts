/** Keep user-entered codes intact; the MJ command is added only when copying. */
export function formatProfileCode(value: string) {
  return `--profile ${value.trim().replace(/^--profile\s+/i, '')}`;
}

export function longShortCodes(values: string[]) {
  return values.filter((value) => Array.from(value.trim()).length > 7);
}

export function confirmShortCodes(values: string[]) {
  const count = longShortCodes(values).length;
  return (
    !count ||
    window.confirm(
      `有 ${count} 个短码超过 7 个字符，输入确定正确吗？\n确认后按原内容保存，不会截断或改变大小写。`,
    )
  );
}

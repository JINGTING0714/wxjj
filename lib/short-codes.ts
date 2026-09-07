/** Keep user-entered codes intact; the MJ command is added only when copying. */
export function formatProfileCode(value: string) {
  return `--profile ${value.trim().replace(/^--profile\s+/i, '')}`;
}

export function longShortCodes(values: string[]) {
  return values.filter((value) => Array.from(value.trim()).length > 7);
}

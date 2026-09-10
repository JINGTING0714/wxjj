export function videoTime(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  return rounded < 60
    ? `${rounded} 秒`
    : `${Math.floor(rounded / 60)} 分 ${rounded % 60} 秒`;
}

export function videoProgressDetail(
  value: number,
  elapsed: number,
  encodingElapsed: number,
  duration: number,
) {
  const parts = [`已用 ${videoTime(elapsed)}`];
  if (value > 0.01 && value < 0.99 && encodingElapsed >= 3) {
    parts.push(`约剩 ${videoTime((encodingElapsed * (1 - value)) / value)}`);
    parts.push(`${((duration * value) / encodingElapsed).toFixed(2)}× 速度`);
  }
  return parts.join(' · ');
}

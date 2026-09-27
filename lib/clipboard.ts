export async function copyText(text: string) {
  try {
    if (!text.trim()) throw new Error('没有可复制的内容。');
    if (!navigator.clipboard?.writeText)
      throw new Error('当前浏览器不支持复制，请使用 HTTPS 页面或手动复制。');
    await navigator.clipboard.writeText(text);
    window.dispatchEvent(
      new CustomEvent('prism:copy-feedback', {
        detail: { message: '已复制', error: false },
      }),
    );
    return true;
  } catch (error) {
    const message =
      error instanceof Error && error.name !== 'NotAllowedError'
        ? error.message
        : '浏览器未允许复制，请检查剪贴板权限后重试。';
    window.dispatchEvent(
      new CustomEvent('prism:copy-feedback', {
        detail: { message: `复制失败：${message}`, error: true },
      }),
    );
    return false;
  }
}

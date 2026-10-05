// Apply the saved appearance before the first page paint.
(() => {
  try {
    const preference = localStorage.getItem('prism-theme');
    const theme = preference === 'light' || preference === 'dark' ? preference : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch { /* The application still works when browser storage is unavailable. */ }
})();

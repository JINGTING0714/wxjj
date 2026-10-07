export function installFileDrop() {
  let highlighted: Element | null = null;
  let recent: HTMLInputElement | null = null;
  const visible = (input: HTMLInputElement) => !input.matches(':disabled') && !input.closest('[hidden], [aria-hidden="true"], [data-state="closed"]') && !!input.closest('label, [data-file-drop-target]')?.getClientRects().length;
  const resolveInput = (target: EventTarget | null) => {
    if (target instanceof Element) {
      const zone = target.closest<HTMLElement>('[data-file-drop-target]');
      const explicit = zone?.dataset.fileDropTarget ? document.getElementById(zone.dataset.fileDropTarget) : null;
      if (explicit instanceof HTMLInputElement && !explicit.matches(':disabled') && zone?.getClientRects().length) return { input: explicit, zone };
      const label = target.closest('label');
      const direct = label?.querySelector<HTMLInputElement>('input[type=file]');
      if (direct && visible(direct)) return { input: direct, zone: label! };
      const preview = target.closest('.watermark-input-panel');
      const source = preview?.closest('.mobile-workspace')?.querySelector<HTMLInputElement>('.watermark-source-panel input[type=file], .video-source-panel input[type=file]');
      if (source && visible(source)) return { input: source, zone: preview! };
      const panel = target.closest('.screenshot-import-dialog, .sales-section, .mobile-workspace, .studio-page, [role=dialog]');
      const inputs = panel ? Array.from(panel.querySelectorAll<HTMLInputElement>('input[type=file]')).filter(visible) : [];
      const input = inputs.find(item => /image|video|\.(?:png|jpe?g|webp|avif|gif|bmp)\b/.test(item.accept));
      if (input) return { input, zone: target.closest('.screenshot-preview, .sales-review-original, .collage-preview, .watermark-input-panel') || panel! };
    }
    return null;
  };
  const clear = () => { highlighted?.classList.remove('is-file-dragging'); highlighted = null; };
  const deliver = (input: HTMLInputElement, incoming: File[]) => {
    const accepts = input.accept.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    const files = incoming.filter(file => !accepts.length || accepts.some(accept => accept.startsWith('.') ? file.name.toLowerCase().endsWith(accept) : accept.endsWith('/*') ? file.type.startsWith(accept.slice(0, -1)) || (!file.type && accept === 'image/*' && /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(file.name)) : file.type === accept));
    if (!files.length) return false;
    const transfer = new DataTransfer();
    (input.multiple ? files : files.slice(0, 1)).forEach(file => transfer.items.add(file));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); recent = input; return true;
  };
  const remember = (event: Event) => { const destination = resolveInput(event.target); if (destination) recent = destination.input; };
  const drag = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault(); const destination = resolveInput(event.target);
    if (!destination) { clear(); return; }
    event.dataTransfer.dropEffect = 'copy';
    if (highlighted !== destination.zone) { clear(); highlighted = destination.zone; highlighted.classList.add('is-file-dragging'); }
  };
  const drop = (event: DragEvent) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); clear(); const destination = resolveInput(event.target);
    if (destination && !deliver(destination.input, Array.from(event.dataTransfer.files))) window.dispatchEvent(new CustomEvent('prism:copy-feedback', { detail: { message: '请选择这个区域支持的图片或文件格式。', error: true } }));
  };
  const paste = (event: ClipboardEvent) => {
    const images = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
    if (!images.length) return;
    const dialog = [...document.querySelectorAll<HTMLElement>('[role=dialog]')].reverse().find(node => node.getClientRects().length);
    const panel = document.querySelector('.content-frame:not([hidden]) .studio-page');
    const destination = resolveInput(event.target) || resolveInput(dialog || panel) || (recent && visible(recent) ? { input: recent } : null);
    if (destination && deliver(destination.input, images)) event.preventDefault();
  };
  document.addEventListener('dragover', drag); document.addEventListener('dragleave', clear); document.addEventListener('drop', drop); document.addEventListener('paste', paste); document.addEventListener('pointerdown', remember); document.addEventListener('focusin', remember);
  return () => { clear(); document.removeEventListener('dragover', drag); document.removeEventListener('dragleave', clear); document.removeEventListener('drop', drop); document.removeEventListener('paste', paste); document.removeEventListener('pointerdown', remember); document.removeEventListener('focusin', remember); };
}

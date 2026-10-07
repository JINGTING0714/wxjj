export function installFileDrop() {
  let highlighted: HTMLLabelElement | null = null;
  const resolveInput = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;
    const label = target.closest('label');
    const direct = label?.querySelector<HTMLInputElement>('input[type=file]');
    if (direct) return { input: direct, label };
    const preview = target.closest('.watermark-input-panel');
    const workspace = preview?.closest('.mobile-workspace');
    const source = workspace?.querySelector<HTMLInputElement>('.watermark-source-panel input[type=file], .video-source-panel input[type=file]');
    return source ? { input: source, label: source.closest('label') } : null;
  };
  const clear = () => { highlighted?.classList.remove('is-file-dragging'); highlighted = null; };
  const drag = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    const destination = resolveInput(event.target);
    if (!destination || destination.input.disabled) { clear(); return; }
    event.dataTransfer.dropEffect = 'copy';
    if (highlighted !== destination.label) { clear(); highlighted = destination.label; highlighted?.classList.add('is-file-dragging'); }
  };
  const drop = (event: DragEvent) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); clear();
    const destination = resolveInput(event.target);
    if (!destination || destination.input.disabled) return;
    const { input } = destination;
    const accepts = input.accept.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    const files = Array.from(event.dataTransfer.files).filter(file => !accepts.length || accepts.some(accept => accept.startsWith('.') ? file.name.toLowerCase().endsWith(accept) : accept.endsWith('/*') ? file.type.startsWith(accept.slice(0, -1)) || (!file.type && accept === 'image/*' && /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(file.name)) : file.type === accept));
    if (!files.length) {
      window.dispatchEvent(new CustomEvent('prism:copy-feedback', { detail: { message: '这些文件不适合此导入区，请选择页面支持的图片或文件格式。', error: true } })); return;
    }
    const transfer = new DataTransfer();
    (input.multiple ? files : files.slice(0, 1)).forEach(file => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.addEventListener('dragover', drag); document.addEventListener('dragleave', clear); document.addEventListener('drop', drop);
  return () => { clear(); document.removeEventListener('dragover', drag); document.removeEventListener('dragleave', clear); document.removeEventListener('drop', drop); };
}

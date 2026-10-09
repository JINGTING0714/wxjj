'use client';

import { useEffect, useMemo, useState } from 'react';
import { SortableList, SortHandle, moveListItem } from './sortable-list';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { PipelineSource } from '@/lib/pipeline';
import { recognizeLocalImages } from '@/lib/local-ocr';
import { messagesFromOcr } from '@/lib/sales-screenshot';
import { DateTimeFields } from './date-time-fields';
import { ScreenshotReview } from './screenshot-review';
import { ExampleImage } from './example-image';
import { useConfirmation } from './use-confirmation';
import {
  extractSaleNumbers, reconcileSales,
  type RushOrder, type SaleAssignment, type SaleMessage,
} from '@/lib/sales-reconciliation';
import { SectionHead } from './studio-shared';
import { useFileUrls, useWorkspaceState } from './use-workspace-state';
import { useVault } from './vault-provider';
import { SaleRoundCreateDialog, type ManualSaleDraft } from './sale-round-create-dialog';

type SaleItem = { number: number; sourceId: string; name: string; file?: File; cleared?: boolean };
type SaleRound = {
  id: string;
  name: string;
  createdAt: string;
  startTime: string;
  rushOrder: RushOrder | 'exclude';
  items: SaleItem[];
  boardIds: string[];
  screenshots: File[];
  messages: SaleMessage[];
  complete: boolean;
  assignments: SaleAssignment[];
  manualNumbers: number[];
  deliveredNumbers: number[];
};
type IncomingSaleRound = { sources: PipelineSource[]; startNumber: number; boardIds: string[]; complete?: (error?: Error) => void };

export function SalesPanel({ onOpenCollage }: { onOpenCollage: () => void }) {
  const vault = useVault();
  const confirmation = useConfirmation();
  const [reviewScreenshot, setReviewScreenshot] = useState(0);
  const [reviewTop, setReviewTop] = useState<number | undefined>();
  const [removedMessage, setRemovedMessage] = useState<{ roundId: string; entry: SaleMessage } | null>(null);
  const [removedRound, setRemovedRound] = useState<SaleRound | null>(null);
  const workspace = useWorkspaceState('sales', { rounds: [] as SaleRound[], active: '' });
  const { state, setState } = workspace;
  const [supplement, setSupplement] = useState<{ screenshot: number; position: number; buyer: string; time: string; text: string } | null>(null);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const active = state.rounds.find((round) => round.id === state.active) || state.rounds[0];
  const orderedMessages = [...(active?.messages || [])].sort((a, b) => a.screenshot - b.screenshot || a.order - b.order);
  const selectedItem = active?.items.find((item) => item.number === selectedNumber);
  const previewUrl = useFileUrls(selectedItem?.file ? [selectedItem.file] : [])[0];
  const screenshotUrls = useFileUrls(active?.screenshots || []);
  const patchRound = (id: string, update: (round: SaleRound) => SaleRound) =>
    setState((current) => ({ ...current, rounds: current.rounds.map((round) => round.id === id ? update(round) : round) }));
  const removeRound = async () => {
    if (!active || busy || !(await confirmation.ask(`删除“${active.name}”的场次记录、聊天截图和核对内容吗？其他场次与图片库保留；本次可以撤销。`, '删除售图场次', '确认删除场次'))) return;
    setRemovedRound(active);
    setState(current => { const rounds = current.rounds.filter(round => round.id !== active.id); return { ...current, rounds, active: rounds[0]?.id || '' }; });
    setSelectedNumber(null); setReviewScreenshot(0); setStep(0); setRemovedMessage(null); setSupplement(null);
    setMessage('场次已删除。其他场次与图片库保留，可点击“撤销删除场次”恢复。');
  };
  const createManual = async (draft: ManualSaleDraft) => {
    const id = crypto.randomUUID();
    const round: SaleRound = { ...draft, id, createdAt: new Date().toISOString(), rushOrder: 'exclude', boardIds: [], screenshots: [], messages: [], complete: false, assignments: [], manualNumbers: [], deliveredNumbers: [] };
    setState(current => ({ rounds: [round, ...current.rounds], active: id }));
    await workspace.flush(); setStep(0); setMessage(`已创建场次并固定 ${round.items.length} 个号码。接下来上传聊天截图核对。`);
  };
  useEffect(() => {
    const receive = (event: Event) => {
      const incoming = (event as CustomEvent<IncomingSaleRound>).detail;
      if (!incoming?.sources.length) return;
      if (!workspace.ready) { incoming.complete?.(new Error('售图工作台尚未就绪，请稍后重试。')); return; }
      const id = crypto.randomUUID();
      const round: SaleRound = {
        id, name: `售图场次 ${new Date().toLocaleString('zh-CN')}`,
        createdAt: new Date().toISOString(), startTime: '', rushOrder: 'exclude',
        items: incoming.sources.map((source, index) => ({
          number: incoming.startNumber + index,
          sourceId: source.id, name: source.file.name, file: source.file,
        })),
        boardIds: incoming.boardIds, screenshots: [], messages: [], complete: false,
        assignments: [], manualNumbers: [], deliveredNumbers: [],
      };
      setState((current) => ({ rounds: [round, ...current.rounds], active: id }));
      setMessage(`已固定本轮 ${round.items.length} 个号码与图片的对应关系。请填写正式开始时间。`);
      void workspace.flush().then(() => incoming.complete?.(), (error) => incoming.complete?.(error instanceof Error ? error : new Error('场次保存失败')));
    };
    window.addEventListener('prism:create-sale-round', receive);
    return () => window.removeEventListener('prism:create-sale-round', receive);
  }, [workspace.ready]);
  const normalizedStart = active?.startTime.length === 16 ? `${active.startTime}:00` : active?.startTime || '';
  const result = useMemo(() => active && normalizedStart && active.complete
    ? reconcileSales(active.messages, active.items.map((item) => item.number), normalizedStart, active.rushOrder)
    : null, [active, normalizedStart]);
  const assigned = new Map((active?.assignments || []).map((item) => [item.number, item]));
  const buyers = [...new Set((active?.assignments || []).map((item) => item.buyer))];
  const remaining = (active?.items || []).filter((item) => !item.cleared && !assigned.has(item.number) && !active?.manualNumbers.includes(item.number));
  const patchMessage = (id: string, change: Partial<SaleMessage>) => {
    if (!active) return;
    patchRound(active.id, (round) => ({ ...round, complete: false, assignments: [], messages: round.messages.map((item) => item.id === id ? { ...item, ...change } : item) }));
  };
  const addMessage = () => {
    if (!active) return;
    const screenshot = Math.min(reviewScreenshot, Math.max(0, active.screenshots.length - 1));
    setSupplement({ screenshot, position: orderedMessages.filter(entry => entry.screenshot === screenshot).length, buyer: '', time: active.startTime, text: '' });
  };
  const saveSupplement = () => {
    if (!active || !supplement) return;
    if (!supplement.buyer.trim() || !supplement.time || !extractSaleNumbers(supplement.text).length) { setMessage('请补齐昵称、时间和号码，再加入这条购买消息。'); return; }
    patchRound(active.id, round => {
      const messages = [...round.messages].sort((a, b) => a.screenshot - b.screenshot || a.order - b.order);
      const same = messages.filter(entry => entry.screenshot === supplement.screenshot);
      const before = same[supplement.position];
      const last = same[same.length - 1];
      const offset = before ? messages.indexOf(before) : last ? messages.indexOf(last) + 1 : messages.findIndex(entry => entry.screenshot > supplement.screenshot);
      messages.splice(offset < 0 ? messages.length : offset, 0, { id: crypto.randomUUID(), screenshot: supplement.screenshot, order: 0, buyer: supplement.buyer.trim(), time: supplement.time, text: supplement.text.trim() });
      return { ...round, complete: false, assignments: [], messages: messages.map((entry, order) => ({ ...entry, order })) };
    });
    setReviewScreenshot(supplement.screenshot); setSupplement(null);
    setMessage('补录已放到指定位置。请对照原图检查；还可以拖动排序或删除。');
  };
  const reorderMessages = (from: number, to: number) => {
    if (!active || from === to || to < 0 || to >= orderedMessages.length) return;
    patchRound(active.id, round => {
      const messages = [...round.messages].sort((a, b) => a.screenshot - b.screenshot || a.order - b.order);
      const destinationScreenshot = messages[to].screenshot;
      const movedId = messages[from].id;
      const next = moveListItem(messages, from, to).map((entry, order) => ({ ...entry, order, screenshot: entry.id === movedId ? destinationScreenshot : entry.screenshot }));
      return { ...round, complete: false, assignments: [], messages: next };
    });
    setReviewScreenshot(orderedMessages[to].screenshot);
  };
  const moveMessage = (index: number, delta: number) => reorderMessages(index, index + delta);
  const recognize = async () => {
    if (!active?.screenshots.length) return;
    if (active.messages.length && !(await confirmation.ask('重新识别会替换当前消息及补录内容。请先确认你希望重新识别。', '重新识别', '确认重新识别'))) return;
    setBusy(true);
    try {
      const pages = await recognizeLocalImages(active.screenshots, setMessage, 'sales');
      const candidates = messagesFromOcr(pages);
      patchRound(active.id, (round) => ({ ...round, complete: false, assignments: [], messages: candidates }));
      setMessage(candidates.length
        ? `识别到 ${candidates.length} 条号码候选。请按原截图补齐遗漏消息、昵称和时间，确认截图完整后再核对。`
        : '识别完成，但没有找到号码候选。请确认截图清晰、顺序正确；可以删除错误截图后重传，或用“补录漏识别的购买消息”手动添加。');
      if (candidates.length) confirmation.notify('消息已整理好，请把左侧原截图与右侧结果逐条对照，特别检查昵称、时间、号码和重叠消息。确认截图完整后，再生成交付清单。', '请先人工复核');
    } catch (error) {
      setMessage(`识别失败：${error instanceof Error ? error.message : '未知错误'}。可手动添加消息核对。`);
    } finally { setBusy(false); }
  };
  const reorderScreenshots = (from: number, to: number) => {
    if (!active || from === to || to < 0 || to >= active.screenshots.length) return;
    const order = moveListItem(active.screenshots.map((_, index) => index), from, to);
    patchRound(active.id, round => ({ ...round, screenshots: moveListItem(round.screenshots, from, to), messages: round.messages.map(entry => ({ ...entry, screenshot: order.indexOf(entry.screenshot) })), assignments: [], complete: false }));
    setReviewScreenshot(current => order.indexOf(current));
  };
  const moveScreenshot = (index: number, delta: number) => reorderScreenshots(index, index + delta);
  const removeScreenshot = async (index: number) => {
    if (!active || !(await confirmation.ask('删除这张截图及其对应消息吗？其他截图的校对内容会保留。', '删除截图', '确认删除'))) return;
    patchRound(active.id, round => ({
      ...round, screenshots: round.screenshots.filter((_, item) => item !== index),
      messages: round.messages.filter(entry => entry.screenshot !== index).map(entry => ({ ...entry, screenshot: entry.screenshot > index ? entry.screenshot - 1 : entry.screenshot })), assignments: [], complete: false,
    }));
    setReviewScreenshot(current => Math.max(0, Math.min(current, active.screenshots.length - 2)));
    setMessage('已删除截图和对应消息，其他已校对内容仍保留。');
  };
  const goStep = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => document.querySelector(`.sales-section[data-step="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const calculate = () => {
    if (!active || !result) return;
    if (result.issues.some((issue) => issue.reason === '昵称或时间待确认' || issue.reason === '未识别到号码，请核对原消息')) {
      setMessage('仍有昵称、时间或号码待校对，无法形成交付清单。'); return;
    }
    const manualConflict = result.assignments.filter((item) => active.manualNumbers.includes(item.number));
    if (manualConflict.length) {
      setMessage(`人工标记与聊天分配冲突：${manualConflict.map((item) => item.number).join('、')}。请先核实并更正，不能自动覆盖。`);
      return;
    }
    patchRound(active.id, (round) => ({ ...round, assignments: result.assignments, deliveredNumbers: [] }));
    goStep(1);
    confirmation.notify('核对结果已生成，现在进入“分配与交付”。请逐位确认购买者的号码和实际交付情况，再进行站内清理。', '核对完成');
    setMessage(`已核对 ${result.assignments.length} 个号码；${result.remaining.length} 个号码未分配。请逐人确认实际交付。`);
  };
  const removeMessage = async (entry: SaleMessage) => {
    if (!active || !(await confirmation.ask('要移除这条核对消息吗？原截图仍会保留；删除后可以撤销，请再检查一次消息顺序。', '移除消息', '确认移除'))) return;
    setRemovedMessage({ roundId: active.id, entry });
    patchRound(active.id, round => ({ ...round, complete: false, assignments: [], messages: round.messages.filter(message => message.id !== entry.id) }));
  };
  const markManual = () => {
    if (!active) return;
    if (active.messages.length && !active.complete) { setMessage('请先补齐成绩单截图并完成核对，再标记后来售出的号码。'); return; }
    const values = [...new Set(extractSaleNumbers(manualInput))];
    const invalid = values.filter((number) => !active.items.some((item) => item.number === number));
    const conflict = values.filter((number) => assigned.has(number));
    if (invalid.length || conflict.length) {
      setMessage(`无法标记：${invalid.length ? `不存在 ${invalid.join('、')}` : ''}${conflict.length ? `；已分配 ${conflict.join('、')}` : ''}。请先核实。`); return;
    }
    patchRound(active.id, (round) => ({ ...round, manualNumbers: [...new Set([...round.manualNumbers, ...values])] }));
    setManualInput('');
    setMessage(`已记录 ${values.length} 个后来售出／不可再售的号码，重新拼图时会排除。`);
  };
  const clearSold = async () => {
    if (!active || busy) return;
    const numbers = new Set([...active.manualNumbers, ...active.deliveredNumbers]);
    const targets = active.items.filter((item) => numbers.has(item.number) && !item.cleared);
    const soldIds = new Set(targets.map((item) => item.sourceId));
    const affected = state.rounds.filter((round) => round.items.some((item) => soldIds.has(item.sourceId)));
    const boardIds = [...new Set(affected.flatMap((round) => round.boardIds))];
    if (!targets.length) { setMessage('请先确认已交付的购买者，或标记后来售出的号码。'); return; }
    if (!window.confirm(`清理 ${targets.length} 张已售图片在网站内的原图、水印图、处理副本和旧拼图？请先确认原图已由你交付。`)) return;
    setBusy(true);
    try {
      const promises: Promise<unknown>[] = [];
      const originalIds: string[] = [];
      window.dispatchEvent(new CustomEvent('prism:purge-sold-images', { detail: {
        sourceIds: targets.map((item) => item.sourceId),
        boardIds,
        originalIds,
        promises,
      } }));
      await Promise.all(promises);
      const deleteIds = [...new Set([...boardIds, ...targets.map((item) => item.sourceId), ...originalIds])];
      await vault.writeBatch({
        deleteRecords: deleteIds,
        deleteBlobs: deleteIds,
      });
      setState((current) => ({ ...current, rounds: current.rounds.map((round) => affected.some((item) => item.id === round.id)
        ? { ...round, boardIds: [], screenshots: [], items: round.items.map((item) => soldIds.has(item.sourceId) ? { ...item, file: undefined, cleared: true } : item) }
        : round) }));
      await workspace.flush();
      window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
      setMessage(`站内清理完成。请自行删除设备本地的对应原图及副本，避免重复出售争议；现在可用剩图重新拼图。`);
    } catch (error) {
      setMessage(`清理未完成：${error instanceof Error ? error.message : '未知错误'}。请核对未删项并重试，不要将其视为已清除。`);
    } finally { setBusy(false); }
  };
  const sendRemaining = () => {
    if (!remaining.length) return;
    window.dispatchEvent(new CustomEvent('prism:send-to-collage', { detail: remaining.filter((item) => item.file).map((item) => ({ id: item.sourceId, file: item.file! })) }));
    onOpenCollage();
  };
  return <div className="studio-page sales-page" data-sale-step={step}>
    {confirmation.dialog}
    <Dialog open={!!supplement} onOpenChange={open => { if (!open) setSupplement(null); }}>
      <DialogContent className="sale-supplement-dialog">
        <DialogHeader><DialogTitle>补录购买消息</DialogTitle></DialogHeader>
        {supplement && <><p>对照原截图填写，再选好插入位置。</p>
          <label>对应截图<select aria-label="对应截图" value={supplement.screenshot} onChange={event => { const screenshot = Number(event.target.value); setSupplement({ ...supplement, screenshot, position: 0 }); }}>{active?.screenshots.map((_, index) => <option key={index} value={index}>第 {index + 1} 张</option>)}</select></label>
          <label>插入位置<select aria-label="插入位置" value={supplement.position} onChange={event => setSupplement({ ...supplement, position: Number(event.target.value) })}>{Array.from({ length: orderedMessages.filter(entry => entry.screenshot === supplement.screenshot).length + 1 }, (_, index) => <option value={index} key={index}>第 {supplement.screenshot + 1} 张 · 插入为第 {index + 1} 条消息</option>)}</select></label>
          <label>昵称<input autoFocus value={supplement.buyer} onChange={event => setSupplement({ ...supplement, buyer: event.target.value })} /></label>
          <DateTimeFields label="消息时间" value={supplement.time} onChange={time => setSupplement({ ...supplement, time })} />
          <label>号码原文<textarea value={supplement.text} onChange={event => setSupplement({ ...supplement, text: event.target.value })} placeholder="例如 76 101" /></label>
          <Button onClick={saveSupplement}>加入所选位置</Button></>}
      </DialogContent>
    </Dialog>
    <SectionHead eyebrow="SALES RECONCILIATION" number="10" title="售图核对" description="按截图顺序核对号码、交付后清理站内图片，并用剩图重新拼图。" actions={<SaleRoundCreateDialog disabled={!workspace.ready || vault.status !== 'unlocked'} onCreate={createManual} />} />
    {workspace.saveError && <p className="error-banner">{workspace.saveError}</p>}
    {message && <output className="ledger-message">{message}</output>}
    <div className="sales-round-toolbar"><label>场次<select value={active?.id || ''} onChange={(event) => setState((current) => ({ ...current, active: event.target.value }))}>{state.rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select></label>{active && <Button variant="outline" disabled={busy} onClick={() => void removeRound()}>删除当前场次</Button>}<p>每场号码固定。可自行新建，也可从编号拼图创建。</p></div>
    {removedRound && <Button variant="outline" onClick={() => { const round = removedRound; setState(current => ({ ...current, rounds: [...current.rounds, round], active: round.id })); setRemovedRound(null); setMessage('已恢复删除的场次。'); }}>撤销删除场次</Button>}
    {!active ? <p className="empty-state">还没有场次。点击“新建售图场次”，或从拼图工坊生成的编号拼图创建。</p> : <>
      <div className="sales-settings"><label>场次名称<input value={active.name} onChange={(event) => patchRound(active.id, (round) => ({ ...round, name: event.target.value }))} /></label><DateTimeFields compact label="正式开始时间" value={active.startTime} onChange={value => patchRound(active.id, round => ({ ...round, startTime: value, assignments: [] }))} /><label>抢跑处理<select value={active.rushOrder} onChange={(event) => patchRound(active.id, (round) => ({ ...round, rushOrder: event.target.value as SaleRound['rushOrder'], assignments: [] }))}><option value="exclude">抢跑不参与</option><option value="original">后置 · 原先后顺序</option><option value="nearest">后置 · 越接近正式第一人越先</option></select></label></div>

      <section className="sales-section" data-step="0">
        <h2>1. 截图顺序与消息校对</h2>
        <p>按聊天真实先后顺序上传；缺图必须补齐才可核对交付。重叠的同一条消息请只保留一次。</p>
        <label className="mini-file">上传成绩单截图<input id="sales-chat-images" disabled={busy} type="file" accept="image/*" multiple onChange={(event) => { const added = Array.from(event.target.files || []); patchRound(active.id, (round) => ({ ...round, screenshots: [...round.screenshots, ...added], complete: false, assignments: [] })); event.target.value = ''; }} /></label>
        <div className="sales-review-workspace"><aside className="sales-review-original" data-file-drop-target="sales-chat-images" tabIndex={0}>
        {!screenshotUrls.length && <button type="button" className="sales-empty-preview" onClick={() => document.getElementById('sales-chat-images')?.click()}>拖入聊天截图，或按 Ctrl+V 粘贴图片<br /><small>也可以点击选择截图；上传后在这里对照原图。</small></button>}
        {screenshotUrls.length > 0 && <ScreenshotReview focusTop={reviewTop} key={`${active.id}:${Math.min(reviewScreenshot, screenshotUrls.length - 1)}`} url={screenshotUrls[Math.min(reviewScreenshot, screenshotUrls.length - 1)]} title={`原聊天截图 · 第 ${Math.min(reviewScreenshot + 1, screenshotUrls.length)} 张`} />}
        <SortableList className="sales-screenshots" disabled={busy} onMove={reorderScreenshots}>{active.screenshots.map((file, index) => <article key={`${file.name}-${index}`}><SortHandle disabled={busy} /><ExampleImage src={screenshotUrls[index]} alt={`第 ${index + 1} 张成绩单截图`} /><button onClick={() => setReviewScreenshot(index)}>对照第 {index + 1} 张</button><span>{file.name}</span><button disabled={index === 0 || busy} onClick={() => moveScreenshot(index, -1)} type="button">上移</button><button disabled={index === active.screenshots.length - 1 || busy} onClick={() => moveScreenshot(index, 1)} type="button">下移</button><button disabled={busy} onClick={() => void removeScreenshot(index)} type="button">删除截图</button></article>)}</SortableList>
        </aside><div className="sales-review-results">
        <div className="sales-actions"><Button disabled={!active.screenshots.length || busy} onClick={() => void recognize()}>{busy ? '识别中…' : '本机识别号码候选'}</Button><Button onClick={addMessage} variant="outline">补录漏识别的购买消息</Button></div>
        <p className="privacy-hint">识别漏掉购买者、时间或号码时，可补录截图中的那一条购买消息；这里不会发送聊天消息。点击或编辑消息会切换左侧对应截图。</p>
        {removedMessage?.roundId === active.id && <Button variant="outline" onClick={() => { patchRound(active.id, round => ({ ...round, complete: false, assignments: [], messages: [...round.messages, removedMessage.entry] })); setRemovedMessage(null); }}>撤销删除消息</Button>}
        <SortableList className="sales-messages" disabled={busy} onMove={reorderMessages}>{orderedMessages.map((entry, index) => <article key={entry.id} onFocusCapture={() => { setReviewScreenshot(entry.screenshot); setReviewTop(entry.ocrTop); }}>
          <strong>消息 {index + 1} · 第 {entry.screenshot + 1} 张</strong>
          <div className="sales-message-order"><SortHandle disabled={busy} /><button disabled={index === 0} type="button" onClick={() => moveMessage(index, -1)}>上移</button><button disabled={index === orderedMessages.length - 1} type="button" onClick={() => moveMessage(index, 1)}>下移</button><button type="button" onClick={() => void removeMessage(entry)}>删除消息</button></div>
          {entry.ocrConfidence !== undefined && entry.ocrConfidence < 90 && <p className="sales-ocr-warning">OCR 参考值 {Math.round(entry.ocrConfidence)}%，低于 90%。请仔细对照原图检查昵称、时间和号码。</p>}
          <label>对应截图<select aria-label="对应截图" value={entry.screenshot} onChange={(event) => patchMessage(entry.id, { screenshot: Number(event.target.value) })}>{active.screenshots.map((file, screen) => <option key={`${file.name}-${screen}`} value={screen}>第 {screen + 1} 张</option>)}</select></label>
          <label>昵称<input value={entry.buyer} onChange={(event) => patchMessage(entry.id, { buyer: event.target.value })} /></label>
          <DateTimeFields compact label="消息时间" value={entry.time} onChange={value => patchMessage(entry.id, { time: value })} />
          <label>号码原文<textarea aria-label="号码原文" value={entry.text} onChange={(event) => patchMessage(entry.id, { text: event.target.value })} /></label>
          <label><input type="checkbox" checked={!!entry.ignored} onChange={(event) => patchMessage(entry.id, { ignored: event.target.checked })} />重复截图中的同一消息／不参与</label>
        </article>)}</SortableList>
        <label className="sales-complete"><input type="checkbox" checked={active.complete} onChange={async event => { const checked = event.target.checked; if (checked && !(await confirmation.ask('请确认：所有聊天截图已补齐，顺序、昵称、时分秒和号码已逐条核对；重叠消息只参与一次。这样才能安心生成交付清单。', '确认人工复核完成', '已复核，继续'))) return; patchRound(active.id, round => ({ ...round, complete: checked, assignments: [] })); }} />我已核对全部截图、顺序、昵称、时间和号码；没有缺图或漏消息</label>
        <Button disabled={!result || !active.screenshots.length || !active.messages.length || busy} onClick={calculate}>生成核对结果</Button>
        </div></div>
      </section>
      <section className="sales-section" data-step="1"><h2>2. 号码与购买者</h2><div className="sales-items">{active.items.map((item) => { const allocation = assigned.get(item.number); return <button key={item.number} type="button" onClick={() => setSelectedNumber(item.number)} className={item.cleared ? 'is-cleared' : ''}><strong>{item.number}</strong><span>{item.cleared ? '已清理' : allocation ? allocation.buyer : active.manualNumbers.includes(item.number) ? '后来售出' : '剩余'}</span></button>; })}</div>{selectedItem && <div className="sales-preview"><strong>{selectedItem.number} · {selectedItem.name}</strong>{previewUrl ? <img src={previewUrl} alt={`${selectedItem.number} 号对应图片`} /> : <p>站内图片已清理，仅保留文字记录。</p>}</div>}{buyers.map((buyer) => { const owned = active.assignments.filter((entry) => entry.buyer === buyer).map((entry) => entry.number); const allDelivered = owned.every((number) => active.deliveredNumbers.includes(number)); return <article className="sales-buyer" key={buyer}><strong>{buyer}：{owned.join('、')}</strong><span>{active.assignments.some((entry) => entry.buyer === buyer && entry.rush) ? '含后置抢跑分配' : '正式时间消息'}</span><Button variant="outline" onClick={() => patchRound(active.id, (round) => ({ ...round, deliveredNumbers: allDelivered ? round.deliveredNumbers.filter((number) => !owned.includes(number)) : [...new Set([...round.deliveredNumbers, ...owned])] }))}>{allDelivered ? '撤销交付确认' : '确认原图已交付'}</Button></article>; })}{result?.issues.length ? <div className="sales-issues"><strong>核对提示</strong>{result.issues.map((issue, index) => <p key={index}>{issue.number ?? '消息'}：{issue.reason}</p>)}</div> : null}</section>
      <section className="sales-section" data-step="2"><h2>3. 后来售出与重新拼图</h2><p>你可以补记聊天核对后又没有的号码；已分配的号码不会被静默覆盖。</p><div className="sales-actions"><input aria-label="后来售出的号码" placeholder="例如 3、7、12" value={manualInput} onChange={(event) => setManualInput(event.target.value)} /><Button variant="outline" onClick={markManual}>标记后来售出</Button></div><div className="sales-manual-list">{active.manualNumbers.map((number) => <span key={number}>{number} 号 <button disabled={active.items.find((item) => item.number === number)?.cleared} type="button" onClick={() => patchRound(active.id, (round) => ({ ...round, manualNumbers: round.manualNumbers.filter((item) => item !== number) }))}>撤销标记</button></span>)}</div><p>当前可用于下一版拼图：{remaining.filter(item => item.file).length} 张。</p><div className="sales-actions"><Button disabled={busy} onClick={() => void clearSold()}>确认并清理已售图片与旧拼图</Button><Button disabled={!remaining.some(item => item.file)} onClick={sendRemaining} variant="outline">剩图送去重新拼图</Button></div><p>站内清理后仍需自行删除手机或电脑本地保存的原图及副本。</p></section>
      <nav className="sales-step-tabs" aria-label="售图核对步骤">{['上传与校对','分配与交付','清理与剩图'].map((label, index) => <Button key={label} variant={step === index ? 'default' : 'outline'} onClick={() => goStep(index)}>{index + 1}. {label}</Button>)}</nav>
      {step === 1 && <Button className="sales-next-step" onClick={() => goStep(2)}>继续：清理与剩图 →</Button>}
    </>}
  </div>;
}

'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { SectionHead } from './studio-shared';
import { useFileUrls, useWorkspaceState } from './use-workspace-state';
import { ExampleImage } from './example-image';
import {
  enhancementPresets,
  type EnhancementSettings,
} from '@/lib/image-enhancement';
import { enhanceImage, assessImage } from '@/lib/image-enhancement-client';
import type { EnhancementMode } from '@/lib/super-resolution';
import {
  sendPipeline,
  type PipelineSource,
  type PipelineTransfer,
} from '@/lib/pipeline';
import { downloadBlob, downloadZip } from '@/lib/download';
import { useVault } from './vault-provider';

type Photo = PipelineSource & {
  output?: File;
  outputRevision?: string;
  width?: number;
  height?: number;
  applied?: EnhancementSettings;
  appliedMode?: EnhancementMode;
  error?: string;
  sent?: boolean;
};
export function ImageEnhancementPanel({
  onOpenWatermark,
}: {
  onOpenWatermark: () => void;
}) {
  const vault = useVault(),
    workspace = useWorkspaceState('image-enhancement', {
      photos: [] as Photo[],
      settings: enhancementPresets.natural,
      mode: 'auto' as EnhancementMode | 'auto',
      autoSend: true,
      standaloneBatchId: '',
    });
  const { state, setState } = workspace;
  const [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState(''),
    [showOriginal, setShowOriginal] = useState(false),
    [detail, setDetail] = useState(false);
  const controller = useRef<AbortController | null>(null),
    task = useRef<Promise<void> | null>(null),
    flush = useRef(workspace.flush);
  flush.current = workspace.flush;
  const photo =
      state.photos[Math.min(selected, Math.max(0, state.photos.length - 1))],
    urls = useFileUrls(
      photo ? [photo.file, ...(photo.output ? [photo.output] : [])] : [],
    );
  useEffect(() => {
    const stop = () => controller.current?.abort(),
      checkpoint = (event: Event) => {
        stop();
        if (task.current)
          (event as CustomEvent<Promise<unknown>[]>).detail.push(
            task.current.then(() => flush.current()),
          );
      };
    window.addEventListener('prism:stop-processing', stop);
    window.addEventListener('prism:checkpoint', checkpoint);
    return () => {
      stop();
      window.removeEventListener('prism:stop-processing', stop);
      window.removeEventListener('prism:checkpoint', checkpoint);
    };
  }, []);
  useEffect(() => {
    if (!workspace.ready) return;
    const receive = (event: Event) => {
      event.preventDefault();
      const { sources, complete, batchId, batchTitle } = (
          event as CustomEvent<PipelineTransfer>
        ).detail,
        current = workspace.current.current;
      if (controller.current || vault.busy) {
        complete(new Error('画质增强正在处理，请等本次完成后再分流。'));
        return;
      }
      const map = new Map(current.photos.map((photo) => [photo.id, photo]));
      for (const source of sources) {
        const old = map.get(source.id);
        map.set(
          source.id,
          old &&
            (old.file === source.file ||
              (source.revision && source.revision === old.revision))
            ? {
                ...old,
                batchId: source.batchId || batchId,
                batchTitle: source.batchTitle || batchTitle,
              }
            : {
                ...source,
                batchId: source.batchId || batchId,
                batchTitle: source.batchTitle || batchTitle,
              },
        );
      }
      if (map.size > 200) {
        complete(
          new Error('画质增强每批最多保留 200 张，请移除已完成的图片后重试。'),
        );
        return;
      }
      setState((current) => ({ ...current, photos: [...map.values()] }));
      void workspace.flush().then(
        () => complete(),
        (reason) =>
          complete(
            reason instanceof Error ? reason : new Error('增强队列保存失败'),
          ),
      );
    };
    window.addEventListener('prism:send-to-enhancement', receive);
    return () =>
      window.removeEventListener('prism:send-to-enhancement', receive);
  }, [workspace.ready, vault.busy]);
  useEffect(() => {
    const purge = (event: Event) => {
      const detail = (
          event as CustomEvent<{
            originalIds: string[];
            promises: Promise<unknown>[];
          }>
        ).detail,
        ids = new Set(detail.originalIds);
      if (
        !workspace.current.current.photos.some(
          (photo) =>
            ids.has(photo.id) || ids.has(photo.id.replace(/^png-clean-/, '')),
        )
      )
        return;
      controller.current?.abort();
      setState((current) => ({
        ...current,
        photos: current.photos.filter(
          (photo) =>
            !ids.has(photo.id) && !ids.has(photo.id.replace(/^png-clean-/, '')),
        ),
      }));
      detail.promises.push(workspace.flush());
    };
    window.addEventListener('prism:purge-png-images', purge);
    return () => window.removeEventListener('prism:purge-png-images', purge);
  }, [workspace.ready]);
  const sendPhotos = async (
    items: Photo[],
    original = false,
    navigate = true,
  ) => {
    if (!items.length) return;
    setProgress('正在保存并汇入水印工坊…');
    const standalone =
      workspace.current.current.standaloneBatchId ||
      `enhance-flow-${crypto.randomUUID()}`;
    setState((current) => ({ ...current, standaloneBatchId: standalone }));
    await workspace.flush();
    const groups = new Map<string, Photo[]>();
    for (const item of items) {
      const id = item.batchId || standalone;
      groups.set(id, [...(groups.get(id) || []), item]);
    }
    for (const [batchId, photos] of groups) {
      await sendPipeline('watermark', {
        batchId,
        batchTitle: photos[0].batchTitle || '画质增强图片',
        sources: photos.map((photo) => ({
          id: photo.id,
          file: original ? photo.file : photo.output!,
          batchId,
          sequence: photo.sequence,
          revision: original ? photo.revision : photo.outputRevision,
          inputRevision: photo.revision,
        })),
        settledIds: photos.map((photo) => photo.id),
      });
      setState((current) => ({
        ...current,
        photos: current.photos.map((photo) =>
          photos.some((item) => item.id === photo.id)
            ? { ...photo, sent: true }
            : photo,
        ),
      }));
      await workspace.flush();
    }
    if (original) {
      const detail = {
        ids: items.map((photo) => photo.id),
        promises: [] as Promise<unknown>[],
      };
      window.dispatchEvent(
        new CustomEvent('prism:enhancement-bypass', { detail }),
      );
      await Promise.all(detail.promises);
    }
    setProgress(
      `已汇入水印工坊：${items.length} 张。同批图片可一起打水印、继续拼图。`,
    );
    if (navigate) onOpenWatermark();
  };
  const send = async (items: Photo[], original = false) => {
    if (busy || vault.busy) return;
    setBusy(true);
    setError('');
    try {
      await sendPhotos(items, original);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '尚未汇入水印工坊，增强结果已保留，可稍后重试。',
      );
    } finally {
      setBusy(false);
    }
  };
  const run = (all: boolean) => {
    if (busy || !photo || !workspace.ready || vault.busy || controller.current)
      return;
    const abort = new AbortController(),
      ids = all
        ? state.photos.filter((photo) => !photo.sent).map((item) => item.id)
        : [photo.id],
      settings = { ...state.settings },
      choice = state.mode;
    if (!ids.length) {
      setProgress('当前图片都已汇入水印工坊，可以选择单张重新增强。');
      return;
    }
    controller.current = abort;
    setBusy(true);
    setError('');
    task.current = (async () => {
      let completed = 0,
        failed = 0;
      try {
        for (let index = 0; index < ids.length; index++) {
          abort.signal.throwIfAborted();
          const item = workspace.current.current.photos.find(
            (photo) => photo.id === ids[index],
          );
          if (!item) continue;
          try {
            const mode =
              choice === 'auto' ? (await assessImage(item.file)).mode : choice;
            const result = await enhanceImage(
              item.file,
              settings,
              abort.signal,
              (value, label) =>
                setProgress(
                  `第 ${index + 1}/${ids.length} 张 · ${label || '清晰度处理'} · ${Math.round(value * 100)}%`,
                ),
              mode,
            );
            setState((current) => ({
              ...current,
              photos: current.photos.map((photo) =>
                photo.id === item.id
                  ? {
                      ...photo,
                      output: result.file,
                      outputRevision: result.revision,
                      width: result.width,
                      height: result.height,
                      applied: settings,
                      appliedMode: mode,
                      error: '',
                      sent: false,
                    }
                  : photo,
              ),
            }));
            await workspace.flush();
            completed++;
          } catch (reason) {
            if (abort.signal.aborted) throw reason;
            failed++;
            const message =
              reason instanceof Error ? reason.message : '处理失败';
            setState((current) => ({
              ...current,
              photos: current.photos.map((photo) =>
                photo.id === item.id ? { ...photo, error: message } : photo,
              ),
            }));
          }
        }
        await workspace.flush();
        setProgress(
          `处理完成：${completed} 张成功${failed ? `，${failed} 张未完成，请检查提示并重试` : ''}。请放大对照人物、发丝和配饰。`,
        );
        if (
          workspace.current.current.autoSend &&
          completed &&
          !abort.signal.aborted
        ) {
          const outputs = workspace.current.current.photos.filter(
            (photo) =>
              ids.includes(photo.id) &&
              photo.output &&
              !photo.error &&
              !photo.sent,
          );
          await sendPhotos(outputs);
        }
      } catch (reason) {
        setProgress(
          abort.signal.aborted
            ? '已取消，已完成的增强结果保留。'
            : '增强结果已保留，尚未全部汇入水印工坊。',
        );
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setBusy(false);
        controller.current = null;
        task.current = null;
      }
    })();
  };
  const remove = async () => {
    if (!photo || busy) return;
    setBusy(true);
    setError('');
    try {
      if (photo.batchId)
        await sendPipeline('watermark', {
          sources: [],
          batchId: photo.batchId,
          batchTitle: photo.batchTitle,
          settledIds: [photo.id],
        });
      setState((current) => ({
        ...current,
        photos: current.photos.filter((item) => item.id !== photo.id),
      }));
      setSelected(0);
      await workspace.flush();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '移除失败，请重试。');
    } finally {
      setBusy(false);
    }
  };
  const outputs = state.photos.filter((photo) => photo.output),
    pendingOutputs = outputs.filter((photo) => !photo.sent);
  return (
    <div className="studio-page enhancement-page">
      <SectionHead
        eyebrow="LOCAL SUPER RESOLUTION"
        number="14"
        title="画质增强"
        description="接在 PNG 清洗后：本机 2× / 4× 超分辨率重建边缘与纹理，增强完成后汇入同一水印批次，继续打水印、拼图。"
      />
      <div className="enhancement-import">
        <label className="mini-file">
          选择图片
          <input
            id="enhancement-images"
            type="file"
            accept="image/*"
            multiple
            disabled={busy || !workspace.ready || vault.busy}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length + state.photos.length > 200) {
                setError('每批最多 200 张，请减少选择。');
                return;
              }
              setState((current) => ({
                ...current,
                photos: [
                  ...current.photos,
                  ...files.map((file) => ({ id: crypto.randomUUID(), file })),
                ],
              }));
              setError('');
            }}
          />
        </label>
        <small>
          也可由 PNG 清洗分流，或拖入、粘贴图片。输出最多 2000 万像素。
        </small>
      </div>
      {(error || workspace.saveError) && (
        <p className="error-banner" role="alert">
          {error || workspace.saveError}
        </p>
      )}
      <div className="enhancement-layout">
        <section className="enhancement-controls">
          <h2>增强方式</h2>
          <label>
            清晰度与分辨率
            <select
              aria-label="增强方式"
              value={state.mode}
              disabled={busy}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  mode: event.target.value as typeof state.mode,
                }))
              }
            >
              <option value="auto">按尺寸推荐：2× 或原尺寸</option>
              <option value="sr2">2× 超分辨率 · 推荐先试</option>
              <option value="sr4">4× 超分辨率 · 更慢、更占空间</option>
              <option value="clarity">原尺寸去灰雾与清晰度增强</option>
            </select>
          </label>
          <p>
            首次使用需下载约 2.5 MB 模型和约 14–29 MB
            运行组件，图片留在本机。支持的设备优先用 GPU；CPU
            模式可能较慢，可以取消。模型估计出的细节可能偏离原图，请放大对照。
          </p>
          <div className="enhancement-presets">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  settings: enhancementPresets.natural,
                }))
              }
            >
              自然保真
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  settings: enhancementPresets.clear,
                }))
              }
            >
              清晰增强
            </Button>
          </div>
          {(
            [
              ['dehaze', '去灰雾'],
              ['clarity', '局部层次'],
              ['sharpen', '细节锐化'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label} · {Math.round(state.settings[key] * 100)}%
              <input
                aria-label={label}
                type="range"
                min="0"
                max="1"
                step=".05"
                disabled={busy}
                value={state.settings[key]}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      [key]: Number(event.target.value),
                    },
                  }))
                }
              />
            </label>
          ))}
          <label className="enhancement-auto-send">
            <input
              type="checkbox"
              checked={state.autoSend}
              disabled={busy}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  autoSend: event.target.checked,
                }))
              }
            />
            <span>增强完成后自动汇入水印工坊</span>
          </label>
          <div className="enhancement-actions">
            <Button
              disabled={!photo || busy || !workspace.ready || vault.busy}
              onClick={() => run(false)}
            >
              增强当前图片
            </Button>
            <Button
              variant="outline"
              disabled={
                !state.photos.length || busy || !workspace.ready || vault.busy
              }
              onClick={() => run(true)}
            >
              按当前强度处理全部
            </Button>
            {busy && controller.current && (
              <Button
                variant="outline"
                onClick={() => controller.current?.abort()}
              >
                取消处理
              </Button>
            )}
          </div>
          {progress && <p role="status">{progress}</p>}
          {!!pendingOutputs.length && (
            <Button
              disabled={busy || vault.busy}
              onClick={() => void send(pendingOutputs)}
            >
              将已完成图片汇入水印（{pendingOutputs.length}）
            </Button>
          )}
        </section>
        <section
          className="enhancement-preview"
          data-file-drop-target="enhancement-images"
          tabIndex={0}
        >
          {photo ? (
            <>
              <div className="enhancement-photo-bar">
                <select
                  aria-label="当前图片"
                  value={photo.id}
                  onChange={(event) =>
                    setSelected(
                      state.photos.findIndex(
                        (photo) => photo.id === event.target.value,
                      ),
                    )
                  }
                >
                  {state.photos.map((photo, index) => (
                    <option value={photo.id} key={photo.id}>
                      {index + 1}. {photo.file.name}
                      {photo.sent ? ' · 已送水印' : ''}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  移除当前图片
                </Button>
              </div>
              {photo.batchId && (
                <p className="pipeline-notice">
                  来自 {photo.batchTitle || 'PNG 清洗'}
                  ；与先送水印的图片保留同一批次。
                </p>
              )}
              <div
                className={`enhancement-comparison${detail && photo.output ? ' enhancement-comparison--detail' : ''}`}
                style={
                  {
                    '--detail-width': `${photo.width || 816}px`,
                  } as CSSProperties
                }
              >
                <article>
                  <h3>原图</h3>
                  <ExampleImage src={urls[0]} alt={`原图 ${photo.file.name}`} />
                </article>
                <article>
                  <h3>
                    增强结果
                    {photo.width ? ` · ${photo.width} × ${photo.height}` : ''}
                  </h3>
                  {photo.output ? (
                    <ExampleImage
                      src={showOriginal ? urls[0] : urls[1]}
                      alt={`增强结果 ${photo.file.name}`}
                    />
                  ) : (
                    <p className="enhancement-empty">
                      处理后在这里查看结果，点击可放大核对细节。
                    </p>
                  )}
                </article>
              </div>
              {photo.output && (
                <div className="enhancement-actions">
                  <Button
                    variant="outline"
                    onClick={() => setShowOriginal((value) => !value)}
                  >
                    {showOriginal ? '切回增强结果' : '在结果位置对照原图'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDetail((value) => !value)}
                  >
                    {detail ? '返回整图对照' : '查看同倍率局部细节'}
                  </Button>
                  <Button
                    onClick={() =>
                      downloadBlob(photo.output!, photo.output!.name)
                    }
                  >
                    下载当前增强 PNG
                  </Button>
                </div>
              )}
              <div className="enhancement-actions">
                <Button
                  variant="outline"
                  disabled={busy || vault.busy}
                  onClick={() => void send([photo], true)}
                >
                  这张不增强，原图送水印
                </Button>
              </div>
              {photo.error && <p className="error-banner">{photo.error}</p>}
            </>
          ) : (
            <button
              className="enhancement-empty"
              onClick={() =>
                document.getElementById('enhancement-images')?.click()
              }
            >
              点击选择图片，或从 PNG 清洗送来图片
            </button>
          )}
        </section>
      </div>
      {outputs.length > 1 && (
        <Button
          disabled={busy}
          onClick={() =>
            void downloadZip(
              outputs.map((photo) => ({
                name: photo.output!.name,
                blob: photo.output!,
              })),
              'PRISM-超分增强.zip',
            )
          }
        >
          下载全部增强图片（{outputs.length}）
        </Button>
      )}
    </div>
  );
}

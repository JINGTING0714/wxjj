'use client';
import {
  Check,
  CircleAlert,
  Download,
  FileArchive,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SectionHead } from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BackupInfo } from '@/lib/local-vault';
import { downloadBlob } from '@/lib/download';
import {
  MobileWorkspace,
  MobileWorkspacePanel,
  MobileWorkspaceSheet,
  MobileWorkspaceTabs,
} from '@/components/prism/mobile-workspace';

export function downloadLocalFile(blob: Blob, name: string) {
  downloadBlob(blob, name, { retainMs: 600_000 });
}
export function SecurityPanel() {
  const vault = useVault();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastBackup, setLastBackup] = useState('');
  const [exportProgress, setExportProgress] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [importSeconds, setImportSeconds] = useState(0);
  const importController = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!importController.current) return;
    const start = Date.now(), timer = setInterval(() => setImportSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [!!importProgress]);
  const [readyBackup, setReadyBackup] = useState<{ blob: Blob; name: string } | null>(null);
  const [backup, setBackup] = useState<File>();
  const [info, setInfo] = useState<BackupInfo>();
  const [backupPassword, setBackupPassword] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [replace, setReplace] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');
  const [mobilePanel, setMobilePanel] = useState<
    'vault' | 'backup' | 'recovery'
  >('vault');
  const [boundaryOpen, setBoundaryOpen] = useState(false);
  useEffect(() => {
    setLastBackup(localStorage.getItem('prism-last-backup') || '');
  }, []);
  useEffect(() => {
    if (vault.status !== 'unlocked') {
      setRecoveryKey('');
      setRecoveryPassword('');
      setNotice('');
    }
  }, [vault.status]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Password managers can fill the native input without a React change event.
    const fields = new FormData(e.currentTarget);
    const submittedPassword = String(fields.get('prism-vault-password') ?? password);
    const submittedConfirm = String(fields.get('prism-vault-confirm') ?? confirmPassword);
    void run(async () => {
      if (vault.status === 'uninitialized') {
        if (submittedPassword !== submittedConfirm) throw new Error('两次密码不一致');
        await vault.setup(submittedPassword);
        setNotice('保险库已创建。请接着设置恢复密钥，并单独妥善保管。');
      } else await vault.unlock(submittedPassword);
      setPassword('');
      setConfirmPassword('');
    });
  };
  const exportBackup = () =>
    run(async () => {
      const name = `wxjj-complete-${new Date().toISOString().slice(0, 10)}.prism`;
      const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
      let stream: FileSystemWritableFileStream | undefined;
      let savedDirectly = false;
      setExportProgress('正在准备完整备份…'); setReadyBackup(null);
      try {
        if (picker) {
          try {
            // Open while the button click still has user activation.
            const handle = await picker.call(window, { suggestedName: name, types: [{ description: 'PRISM 加密完整备份', accept: { 'application/zip': ['.prism'] } }] });
            stream = await handle.createWritable();
          } catch (reason) {
            if (reason instanceof DOMException && reason.name === 'AbortError') { setNotice('已取消选择保存位置，保险库资料保留。'); return; }
            if (!(reason instanceof DOMException) || !['SecurityError','NotAllowedError','NotSupportedError'].includes(reason.name)) throw reason;
          }
        }
        const output = stream;
        const blob = await vault.exportBackup({ write: output ? bytes => output.write(bytes) : undefined, onProgress: progress => setExportProgress(`${progress.stage} · ${progress.current} / ${progress.total} 项`) });
        if (output) { await output.close(); stream = undefined; savedDirectly = true; }
        else {
          if (!blob || !blob.size) throw new Error('未生成完整备份，请重试；站内资料保留。');
          setReadyBackup({ blob, name }); downloadLocalFile(blob, name);
        }
      } catch (reason) { await stream?.abort().catch(() => {}); throw reason; }
      finally { setExportProgress(''); }
      const generated = new Date().toLocaleString('zh-CN');
      localStorage.setItem('prism-last-backup', generated);
      setLastBackup(generated);
      setNotice(
        savedDirectly ? '完整备份已保存到你选择的位置，逐项校验已通过。恢复密钥请另外保管。' : '完整备份已生成。若未弹出下载，请点击“再次下载已生成备份”；恢复密钥请另外保管。',
      );
    });
  return (
    <div className="studio-page security-page">
      <SectionHead
        eyebrow="LOCAL SECURITY"
        number="00"
        title="安全与备份"
        description="资料保存在当前浏览器。换设备请使用完整备份迁移。"
      />
      <section className="security-hero">
        <ShieldCheck size={42} />
        <div>
          <Badge className="success-badge">LOCAL ONLY</Badge>
          <h2>本机保存 · 定期备份</h2>
          <p>
            同一网址在不同设备上有独立保险库。迁移后先核对资料，再清理旧设备。
          </p>
        </div>
      </section>
      {(error || vault.error) && (
        <p className="error-banner" role="alert">
          <CircleAlert />
          {error || vault.error}
        </p>
      )}
      {notice && (
        <p className="success-line status-message" role="status">
          <Check />
          {notice}
        </p>
      )}
      <MobileWorkspace className="security-mobile-workspace">
        <MobileWorkspaceTabs
          label="安全与备份工作区"
          onValueChange={setMobilePanel}
          tabs={[
            { value: 'vault', label: '保险库', icon: <LockKeyhole /> },
            { value: 'backup', label: '备份', icon: <FileArchive /> },
            { value: 'recovery', label: '恢复', icon: <KeyRound /> },
          ]}
          value={mobilePanel}
        />
        <div className="security-grid">
          <MobileWorkspacePanel
            active={mobilePanel === 'vault'}
            label="本地保险库"
          >
            <article>
              <div className="security-card-title">
                <LockKeyhole />
                <h3>01 · 本地保险库</h3>
                <Badge>
                  {vault.status === 'unlocked'
                    ? '已解锁'
                    : vault.status === 'loading'
                      ? '正在读取'
                    : vault.status === 'uninitialized'
                      ? '尚未创建'
                      : '已锁定'}
                </Badge>
              </div>
              <p>
                锁定后隐藏资料并暂停处理。再次使用时输入密码解锁。
              </p>
              {vault.status === 'unlocked' ? (
                <Button disabled={busy || vault.busy} onClick={vault.lock}>
                  <LockKeyhole />
                  立即锁定
                </Button>
              ) : (
                <form className="vault-password-form" onSubmit={submit}>
                  <label>
                    保险库密码
                    <Input
                      name="prism-vault-password"
                      autoComplete={
                        vault.status === 'uninitialized'
                          ? 'new-password'
                          : 'current-password'
                      }
                      minLength={8}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </label>
                  {vault.status === 'uninitialized' && (
                    <label>
                      再次输入密码
                      <Input
                        name="prism-vault-confirm"
                        autoComplete="new-password"
                        minLength={8}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        type="password"
                        value={confirmPassword}
                      />
                    </label>
                  )}
                  <Button
                    disabled={busy || vault.status === 'loading'}
                    type="submit"
                  >
                    <KeyRound />
                    {busy
                      ? '请稍候…'
                      : vault.status === 'loading'
                        ? '正在读取本机保险库…'
                      : vault.status === 'uninitialized'
                        ? '创建并解锁'
                        : '解锁保险库'}
                  </Button>
                  {vault.status === 'uninitialized' && (
                    <p>换设备？无需先创建密码，直接在右侧导入原设备备份。</p>
                  )}
                </form>
              )}
            </article>
          </MobileWorkspacePanel>
          <MobileWorkspacePanel
            active={mobilePanel === 'backup'}
            label="完整导出与恢复"
          >
            <article className="backup-card">
              <div className="security-card-title">
                <FileArchive />
                <h3>02 · 完整导出与恢复</h3>
              </div>
              <p>
                .prism 包含全部已保存的资料与工坊队列。恢复使用
                <strong>原设备导出时的密码</strong>
                。验证成功后替换当前保险库。
              </p>
              <div className="backup-actions">
                <Button
                  disabled={busy || vault.status !== 'unlocked'}
                  onClick={exportBackup}
                  variant="outline"
                >
                  <Download />
                  完整导出
                </Button>
                <label className="mini-file">
                  <Upload />
                  选择备份
                  <input
                    accept=".prism,.json,.zip"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f)
                        void run(async () => {
                          setBackup(undefined);
                          setInfo(undefined);
                          setReplace(false);
                          const result = await vault.inspectBackup(f);
                          setBackup(f);
                          setInfo(result);
                        });
                    }}
                    type="file"
                  />
                </label>
              </div>
              {exportProgress && <p className="backup-progress" role="status" aria-live="polite">{exportProgress}<br />正在逐项校验并写入，请保持页面打开。</p>}
              {readyBackup && <Button variant="outline" onClick={() => downloadLocalFile(readyBackup.blob, readyBackup.name)}>再次下载已生成备份</Button>}
              <div className="backup-checklist"><strong>{lastBackup ? `本设备最近生成备份：${lastBackup}` : '尚无本设备备份生成记录'}</strong><ol><li>先保存编辑内容，再点“完整导出”。</li><li>确认 .prism 文件已下载到设备。</li><li>牢记导出时密码，恢复密钥另外保管。</li></ol></div>
              {backup && info && (
                <form
                  className="vault-password-form restore-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const submittedPassword = String(new FormData(e.currentTarget).get('prism-backup-password') ?? backupPassword);
                    void run(async () => {
                      if (vault.status !== 'uninitialized' && !replace)
                        throw new Error('请先确认完整恢复会替换本机保险库');
                      const controller = new AbortController(); importController.current = controller;
                      setImportSeconds(0); setImportProgress('正在准备恢复…');
                      try {
                      const result = await vault.importBackup(
                        backup,
                        submittedPassword,
                        useRecovery,
                        { signal: controller.signal, onProgress: progress => setImportProgress(`${progress.stage} · ${progress.current} / ${progress.total} 项`) },
                      );
                      setBackup(undefined);
                      setInfo(undefined);
                      setBackupPassword('');
                      setReplace(false);
                      setNotice(
                        `完整恢复成功，已自动解锁：${result.records} 条记录、${result.files} 个文件。库分类、图片与已保存设置已恢复。`,
                      );
                      } finally { importController.current = null; setImportProgress(''); }
                    });
                  }}
                >
                  <p>
                    <strong>{backup.name}</strong>
                    <br />
                    {info.records} 条加密记录 · {info.files} 个文件 ·{' '}
                    {(info.bytes / 1024 / 1024).toFixed(2)} MB
                    <br />
                    {info.verified ? '文件完整性校验已通过' : '目录已读取。开始恢复后将逐项校验完整内容；原图和视频保持原样。'}
                    {info.exportedAt &&
                      ` · ${new Date(info.exportedAt).toLocaleString()}`}
                  </p>
                  <label className="check-line">
                    <input
                      checked={useRecovery}
                      onChange={(e) => {
                        setUseRecovery(e.target.checked);
                        setBackupPassword('');
                      }}
                      type="checkbox"
                    />
                    使用这份备份对应的恢复密钥
                  </label>
                  <label>
                    {useRecovery
                      ? '原备份恢复密钥'
                      : '原设备导出时的保险库密码'}
                    <Input
                      name="prism-backup-password"
                      autoComplete={useRecovery ? 'off' : 'section-backup current-password'}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      required
                      type="password"
                      value={backupPassword}
                    />
                  </label>
                  {vault.status !== 'uninitialized' && (
                    <label className="check-line">
                      <input
                        checked={replace}
                        onChange={(e) => setReplace(e.target.checked)}
                        required
                        type="checkbox"
                      />
                      我已备份本机资料，确认用这份备份完整替换当前保险库（不是合并）。
                    </label>
                  )}
                  <Button disabled={busy} type="submit">
                    {busy ? '正在验证全部内容…' : '验证并完整恢复'}
                  </Button>
                  {importProgress && <div className="backup-progress" role="status"><strong>{importProgress}</strong><p>已用 {importSeconds} 秒。大备份会分项处理，请保持页面打开；完成前当前资料保留。</p><Button variant="outline" type="button" onClick={() => { importController.current?.abort(); setImportProgress('正在取消，保留当前保险库…'); }}>取消恢复</Button></div>}
                </form>
              )}
            </article>
          </MobileWorkspacePanel>
          <MobileWorkspacePanel
            active={mobilePanel === 'recovery'}
            label="恢复密钥与重设密码"
          >
            <article>
              <div className="security-card-title">
                <KeyRound />
                <h3>03 · 恢复密钥与重设密码</h3>
              </div>
              <p>
                忘记密码时，用恢复密钥重设并保留资料。请与备份分开保管；重新生成后当前库的旧密钥失效，随后需重新备份。
              </p>
              {vault.status === 'unlocked' ? (
                <form
                  className="vault-password-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      setRecoveryKey(
                        await vault.generateRecovery(recoveryPassword),
                      );
                      setRecoveryPassword('');
                      setNotice(
                        '恢复密钥已设置。请下载保存，再重新导出完整备份。',
                      );
                    });
                  }}
                >
                  <label>
                    验证当前密码
                    <Input
                      name="prism-recovery-current-password"
                      autoComplete="section-recovery current-password"
                      onChange={(e) => setRecoveryPassword(e.target.value)}
                      required
                      type="password"
                      value={recoveryPassword}
                    />
                  </label>
                  <Button disabled={busy} type="submit">
                    生成 / 重新生成恢复密钥
                  </Button>
                  {recoveryKey && (
                    <div className="recovery-secret">
                      <p>仅本次显示，请离线保管，不要发给他人。</p>
                      <textarea
                        aria-label="恢复密钥"
                        readOnly
                        value={recoveryKey}
                      />
                      <Button
                        onClick={() =>
                          downloadLocalFile(
                            new Blob(
                              [
                                `wxjj PRISM 恢复密钥\n${recoveryKey}\n请与备份分开保管。任何持有者都能解锁对应的保险库。`,
                              ],
                              { type: 'text/plain' },
                            ),
                            'wxjj-recovery-key.txt',
                          )
                        }
                        type="button"
                        variant="outline"
                      >
                        <Download />
                        下载恢复密钥
                      </Button>
                    </div>
                  )}
                </form>
              ) : (
                <form
                  className="vault-password-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      if (newPassword !== newConfirm)
                        throw new Error('两次新密码不一致');
                      await vault.recover(recoveryInput, newPassword);
                      setRecoveryInput('');
                      setNewPassword('');
                      setNewConfirm('');
                      setNotice(
                        '密码已重设，全部数据保留，保险库已解锁。请重新导出备份。',
                      );
                    });
                  }}
                >
                  <label>
                    恢复密钥
                    <Input
                      name="prism-recovery-code"
                      autoComplete="off"
                      onChange={(e) => setRecoveryInput(e.target.value)}
                      placeholder="PRISM-…"
                      required
                      type="password"
                      value={recoveryInput}
                    />
                  </label>
                  <label>
                    新密码
                    <Input
                      name="prism-recovery-new-password"
                      autoComplete="new-password"
                      minLength={8}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      type="password"
                      value={newPassword}
                    />
                  </label>
                  <label>
                    再次输入新密码
                    <Input
                      name="prism-recovery-new-confirm"
                      autoComplete="new-password"
                      minLength={8}
                      onChange={(e) => setNewConfirm(e.target.value)}
                      required
                      type="password"
                      value={newConfirm}
                    />
                  </label>
                  <Button
                    disabled={busy || vault.status === 'uninitialized'}
                    type="submit"
                  >
                    保留资料并重设密码
                  </Button>
                </form>
              )}
              <p>
                密码和恢复密钥同时丢失，资料无法恢复。没有恢复密钥的旧库仍需原密码。
              </p>
            </article>
          </MobileWorkspacePanel>
        </div>
      </MobileWorkspace>
      <section className="threat-note desktop-workspace-only">
        <CircleAlert />
        <div>
          <h3>完整备份与后台处理边界</h3>
          <p>
            切换板块可继续处理；锁定、刷新、关窗会暂停。备份包含已保存的队列，导入后可继续处理。资产在本机处理，网站托管服务可能保留普通访问日志。
          </p>
        </div>
      </section>
      <Button
        className="mobile-security-boundary mobile-workspace-only"
        onClick={() => setBoundaryOpen(true)}
        variant="outline"
      >
        <CircleAlert /> 查看完整备份与后台处理边界
      </Button>
      <MobileWorkspaceSheet
        description="关于保存、导出、锁定与浏览器后台执行的限制。"
        onOpenChange={setBoundaryOpen}
        open={boundaryOpen}
        title="处理边界"
      >
        <div className="mobile-detail-copy">
          <p>
            先保存正在编辑的表单，再导出。导出会暂停运算并保存工坊快照；换设备后可查看所有已保存内容并继续未完成队列。
          </p>
          <p>
            同一页切换板块不影响处理；锁定、刷新、关窗或系统冻结标签页会暂停运算。浏览器无法承诺关窗后继续计算。
          </p>
          <p>网站不上传你的资产；静态网站托管服务仍可能保留普通访问日志。</p>
        </div>
      </MobileWorkspaceSheet>
    </div>
  );
}

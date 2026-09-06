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
import { useEffect, useState, type FormEvent } from 'react';
import { SectionHead } from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BackupInfo } from '@/lib/local-vault';

export function downloadLocalFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function SecurityPanel() {
  const vault = useVault();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (vault.status === 'uninitialized') {
        if (password !== confirmPassword) throw new Error('两次密码不一致');
        await vault.setup(password);
        setNotice('保险库已创建。请接着设置恢复密钥，并单独妥善保管。');
      } else await vault.unlock(password);
      setPassword('');
      setConfirmPassword('');
    });
  };
  const exportBackup = () =>
    run(async () => {
      downloadLocalFile(
        await vault.exportBackup(),
        `wxjj-complete-${new Date().toISOString().slice(0, 10)}.prism`,
      );
      setNotice(
        '完整备份已通过解密与完整性检查并生成。请确认浏览器下载已完成；备份含所有已保存库、文字、原图、例图、水印、成品和已保存的工坊设置与队列。编辑表单请先点击保存。',
      );
    });
  return (
    <div className="studio-page security-page">
      <SectionHead
        eyebrow="LOCAL SECURITY"
        number="09"
        title="安全与备份"
        description="不需要 GPT 登录。密码、恢复密钥、文件解析与图像处理都只在你的浏览器内进行。"
      />
      <section className="security-hero">
        <ShieldCheck size={42} />
        <div>
          <Badge className="success-badge">LOCAL ONLY</Badge>
          <h2>数据属于你，也只由你保管</h2>
          <p>
            朋友打开同一个网址，不会看到你的资料。不同设备、浏览器和网址有独立的本地保险库；迁移请使用完整备份，不要清理原设备数据。
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
      <div className="security-grid">
        <article>
          <div className="security-card-title">
            <LockKeyhole />
            <h3>01 · 本地保险库</h3>
            <Badge>
              {vault.status === 'unlocked'
                ? '已解锁'
                : vault.status === 'uninitialized'
                  ? '尚未创建'
                  : '已锁定'}
            </Badge>
          </div>
          <p>
            锁定后工作区、例图、记录和编辑入口全部关闭；后台处理也会停止，避免锁定后仍然产生可见数据。
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
        <article className="backup-card">
          <div className="security-card-title">
            <FileArchive />
            <h3>02 · 完整导出与恢复</h3>
          </div>
          <p>
            .prism 是本产品的加密完整备份，不是普通图片。导入使用
            <strong>原设备导出时的密码</strong>
            。新版会逐个检查文件，全部验证成功后才恢复；不会把两个保险库的数据混在一起。
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
          {backup && info && (
            <form
              className="vault-password-form restore-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (vault.status !== 'uninitialized' && !replace)
                    throw new Error('请先确认完整恢复会替换本机保险库');
                  const result = await vault.importBackup(
                    backup,
                    backupPassword,
                    useRecovery,
                  );
                  setBackup(undefined);
                  setInfo(undefined);
                  setBackupPassword('');
                  setReplace(false);
                  setNotice(
                    `完整恢复成功，已自动解锁：${result.records} 条记录、${result.files} 个文件。库分类、图片与已保存设置已恢复。`,
                  );
                });
              }}
            >
              <p>
                <strong>{backup.name}</strong>
                <br />
                {info.records} 条加密记录 · {info.files} 个文件 ·{' '}
                {(info.bytes / 1024 / 1024).toFixed(2)} MB
                <br />
                {info.verified
                  ? '文件完整性校验已通过'
                  : '旧版备份：继续后将逐项验证解密'}
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
                {useRecovery ? '原备份恢复密钥' : '原设备导出时的保险库密码'}
                <Input
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
            </form>
          )}
        </article>
        <article>
          <div className="security-card-title">
            <KeyRound />
            <h3>03 · 恢复密钥与重设密码</h3>
          </div>
          <p>
            没有服务器后门或邮箱找回。请在还能解锁时生成恢复密钥，并存到其他安全位置。它能重设密码且保留全部资料；重新生成会使当前保险库旧密钥失效（旧备份仍使用导出时的密钥）。
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
                  setNotice('恢复密钥已设置。请下载保存，再重新导出完整备份。');
                });
              }}
            >
              <label>
                验证当前密码
                <Input
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
            密码与恢复密钥同时遗失时，加密数据无法恢复；不会通过清空数据来假装“找回”。旧版没有设置过恢复密钥的保险库，请使用原密码。
          </p>
        </article>
      </div>
      <section className="threat-note">
        <CircleAlert />
        <div>
          <h3>完整备份与后台处理边界</h3>
          <p>
            先保存正在编辑的表单，再导出。导出会暂停运算并保存工坊快照；换设备后可查看所有已保存内容并继续未完成队列。同一页切换板块不影响处理；锁定、刷新、关窗或系统冻结标签页会暂停运算。浏览器无法承诺关窗后继续计算。网站不上传你的资产；静态网站托管服务仍可能保留普通访问日志。
          </p>
        </div>
      </section>
    </div>
  );
}

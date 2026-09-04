'use client';

import { Check, CheckCircle2, CircleAlert, Download, FileArchive, KeyRound, LockKeyhole, ShieldCheck, Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { SectionHead } from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SecurityPanel() {
  const vault = useVault();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [localError, setLocalError] = useState('');

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      if (vault.status === 'uninitialized') await vault.setup(password);
      else await vault.unlock(password);
      setPassword('');
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : '保险库操作失败');
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    try {
      setLocalError('');
      const payload = await vault.exportBackup();
      const url = URL.createObjectURL(payload);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `PRISM-backup-${new Date().toISOString().slice(0, 10)}.prism`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupDone(true);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : '备份导出失败');
    }
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    setLocalError('');
    try {
      await vault.importBackup(file);
      setBackupDone(false);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : '备份导入失败');
    }
  };

  return (
    <div className="studio-page security-page">
      <SectionHead eyebrow="LOCAL SECURITY" number="09" title="安全与备份" description="网站无需 GPT 或 PRISM 账号；打开浏览器即可使用，你只需管理自己设备上的保险库密码。" />
      <section className="security-hero"><div className="security-orbit"><ShieldCheck /><i /><i /></div><div><Badge className="success-badge">ZERO-COLLECTION</Badge><h2>没有任何数据需要交给我们</h2><p>提示词、Profile、Moodboard、长码、例图、水印与处理结果全部留在设备本地。敏感字段默认锁定，只有主动点击才短暂显示。</p></div><div className="security-score"><strong>LOCAL</strong><span>DATA MODE</span></div></section>
      <div className="security-grid">
        <article><div className="security-card-title"><LockKeyhole /><div><p className="eyebrow">VAULT LOCK</p><h3>本机保险库密码</h3></div><Badge variant={vault.status === 'unlocked' ? 'default' : 'outline'}>{vault.status === 'unlocked' ? '本次会话已解锁' : vault.status === 'uninitialized' ? '尚未创建' : '已锁定'}</Badge></div><p>这是本地解密密码，不是网站账号。密码只用于在本机派生 AES-256 加密密钥，不会上传。</p>{vault.status === 'unlocked' ? <Button onClick={vault.lock}><LockKeyhole />立即锁定</Button> : <form className="vault-password-form" onSubmit={submitPassword}><label><span>{vault.status === 'uninitialized' ? '创建保险库密码（至少 8 位）' : '保险库密码'}</span><Input minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="输入本机密码" required type="password" value={password} /></label><Button disabled={busy || vault.status === 'loading'} type="submit"><KeyRound />{busy ? '正在安全解锁…' : vault.status === 'uninitialized' ? '创建并解锁' : '解锁本次会话'}</Button></form>}</article>
        <article><div className="security-card-title"><FileArchive /><div><p className="eyebrow">ENCRYPTED BACKUP</p><h3>离线备份</h3></div></div><p>定期导出加密备份，换设备时再手动导入。PRISM 不会自动同步，也无法替你找回密码。</p><div className="backup-actions"><Button disabled={vault.status === 'uninitialized'} onClick={exportBackup} variant="outline"><Download /> 导出备份</Button><label className="mini-file"><Upload /> 导入备份<input accept="application/json,.prism" onChange={(event) => importBackup(event.target.files?.[0])} type="file" /></label></div>{backupDone && <span className="success-line"><CheckCircle2 /> 加密备份文件已生成</span>}</article>
        <article><div className="security-card-title"><ShieldCheck /><div><p className="eyebrow">PRIVACY DEFAULTS</p><h3>默认防泄露规则</h3></div></div><ul><li><Check /> 提示词整段默认隐藏</li><li><Check /> 阶段短码只展示前三位</li><li><Check /> Profile 长码默认隐藏</li><li><Check /> 离开页面自动重新遮蔽</li><li><Check /> 无广告、分析和第三方追踪</li></ul></article>
      </div>
      {(localError || vault.error) && <p className="error-banner"><CircleAlert /> {localError || vault.error}</p>}
      <section className="threat-note"><CircleAlert /><div><h3>关于后台运行</h3><p>同一网页内切换功能不会中断队列；刷新或彻底关闭浏览器会停止当前批次，已经保存的成品仍会保留。网页无法在被彻底关闭后继续本地图像运算，如需关窗运行，后续可封装桌面版。</p></div></section>
    </div>
  );
}

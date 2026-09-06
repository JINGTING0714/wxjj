'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createVault,
  createRecoveryKey,
  exportVaultFile,
  importVaultFile,
  inspectVaultFile,
  loadEncryptedBlobs,
  loadEncryptedRecords,
  resetVaultPassword,
  unlockVault,
  vaultExists,
  writeVaultBatch,
  type BackupInfo,
  type VaultWrite,
} from '@/lib/local-vault';

type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked';
type VaultContextValue = {
  status: VaultStatus;
  error: string;
  session: number;
  busy: boolean;
  setup: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  saveRecord: <T extends { id: string }>(
    scope: string,
    value: T,
  ) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  loadRecords: <T>(scope: string) => Promise<T[]>;
  saveBlob: (
    scope: string,
    blob: Blob,
    name: string,
    id?: string,
  ) => Promise<string>;
  deleteBlob: (id: string) => Promise<void>;
  loadBlobs: (scope: string) => ReturnType<typeof loadEncryptedBlobs>;
  writeBatch: (batch: VaultWrite) => Promise<void>;
  exportBackup: () => Promise<Blob>;
  inspectBackup: (file: File) => Promise<BackupInfo>;
  importBackup: (
    file: File,
    password: string,
    recovery?: boolean,
  ) => Promise<BackupInfo>;
  generateRecovery: (password: string) => Promise<string>;
  recover: (code: string, password: string) => Promise<void>;
};
const VaultContext = createContext<VaultContextValue | null>(null);
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [error, setError] = useState('');
  const [session, setSession] = useState(0);
  const [busy, setBusy] = useState(false);
  const live = useRef<{
    key: CryptoKey | null;
    session: number;
    frozen: boolean;
  }>({ key: null, session: 0, frozen: false });
  const pending = useRef(new Set<Promise<unknown>>());
  useEffect(() => {
    vaultExists()
      .then((exists) => setStatus(exists ? 'locked' : 'uninitialized'))
      .catch((e) => {
        setError(String(e));
        setStatus('locked');
      });
  }, []);
  useEffect(() => {
    const hide = () =>
      window.dispatchEvent(new CustomEvent('prism:hide-secrets'));
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  const value = useMemo<VaultContextValue>(() => {
    const establish = (key: CryptoKey | null) => {
      live.current.key = key;
      live.current.session++;
      setSession(live.current.session);
      setStatus(key ? 'unlocked' : 'locked');
      setError('');
      window.dispatchEvent(new CustomEvent('prism:hide-secrets'));
    };
    const access = () => {
      const { key, session: token } = live.current;
      if (!key || token !== session || live.current.frozen)
        throw new Error('保险库已锁定或正在完整备份，请解锁后重试。');
      return {
        key,
        check: () => {
          if (
            live.current.session !== token ||
            !live.current.key ||
            live.current.frozen
          )
            throw new Error('保险库会话已结束，操作已取消。');
        },
      };
    };
    const write = (batch: VaultWrite) => {
      const { key, check } = access();
      const task = writeVaultBatch(key, batch, check);
      pending.current.add(task);
      void task.then(
        () => pending.current.delete(task),
        () => pending.current.delete(task),
      );
      return task;
    };
    const checkpoint = async () => {
      const tasks: Promise<unknown>[] = [];
      window.dispatchEvent(
        new CustomEvent('prism:checkpoint', { detail: tasks }),
      );
      await Promise.all(tasks);
      while (pending.current.size) await Promise.all([...pending.current]);
    };
    return {
      status,
      error,
      session,
      busy,
      setup: async (password) => establish(await createVault(password)),
      unlock: async (password) => establish(await unlockVault(password)),
      lock: () => {
        window.dispatchEvent(new CustomEvent('prism:stop-processing'));
        const saving = checkpoint();
        setStatus('locked');
        void saving.then(
          () => establish(null),
          (e) => {
            establish(null);
            setError(`锁定前保存未完成：${String(e)}。已保存的资料不受影响。`);
          },
        );
      },
      writeBatch: write,
      saveRecord: async (scope, record) =>
        write({ records: [{ scope, value: record }] }),
      deleteRecord: async (id) => write({ deleteRecords: [id] }),
      loadRecords: async <T,>(scope: string) => {
        const { key, check } = access();
        const result = await loadEncryptedRecords<T>(key, scope);
        check();
        return result;
      },
      saveBlob: async (scope, blob, name, id = crypto.randomUUID()) => {
        await write({ blobs: [{ id, scope, blob, name }] });
        return id;
      },
      deleteBlob: async (id) => write({ deleteBlobs: [id] }),
      loadBlobs: async (scope) => {
        const { key, check } = access();
        const result = await loadEncryptedBlobs(key, scope);
        check();
        return result;
      },
      exportBackup: async () => {
        if (live.current.frozen) throw new Error('已有备份任务正在进行');
        const { key, check } = access();
        setBusy(true);
        try {
          await checkpoint();
          check();
          live.current.frozen = true;
          return await exportVaultFile(key);
        } finally {
          live.current.frozen = false;
          setBusy(false);
        }
      },
      inspectBackup: inspectVaultFile,
      importBackup: async (file, password, recovery) => {
        if (live.current.frozen) throw new Error('请等待当前备份任务结束');
        setBusy(true);
        const token = live.current.session;
        try {
          await checkpoint();
          live.current.frozen = true;
          const result = await importVaultFile(file, password, {
            recovery,
            assertSession: () => {
              if (live.current.session !== token)
                throw new Error('会话改变，导入已取消');
            },
          });
          window.dispatchEvent(new CustomEvent('prism:stop-processing'));
          establish(result.key);
          return result.info;
        } finally {
          live.current.frozen = false;
          setBusy(false);
        }
      },
      generateRecovery: async (password) => {
        const { key, check } = access();
        check();
        return createRecoveryKey(key, password);
      },
      recover: async (code, password) =>
        establish(await resetVaultPassword(code, password)),
    };
  }, [status, error, session, busy]);
  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  );
}
export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used inside VaultProvider');
  return context;
}

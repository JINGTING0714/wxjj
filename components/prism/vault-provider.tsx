'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  createVault,
  deleteEncryptedBlob,
  deleteEncryptedRecord,
  exportVaultFile,
  importVaultFile,
  loadEncryptedBlobs,
  loadEncryptedRecords,
  saveEncryptedBlob,
  saveEncryptedRecord,
  unlockVault,
  vaultExists,
} from '@/lib/local-vault';

type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked';

type VaultContextValue = {
  status: VaultStatus;
  error: string;
  setup: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  saveRecord: <T extends { id: string }>(scope: string, value: T) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  loadRecords: <T>(scope: string) => Promise<T[]>;
  saveBlob: (scope: string, blob: Blob, name: string, id?: string) => Promise<string>;
  deleteBlob: (id: string) => Promise<void>;
  loadBlobs: (scope: string) => ReturnType<typeof loadEncryptedBlobs>;
  exportBackup: () => Promise<Blob>;
  importBackup: (file: File) => Promise<void>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    vaultExists().then((exists) => setStatus(exists ? 'locked' : 'uninitialized')).catch(() => setStatus('uninitialized'));
  }, []);

  useEffect(() => {
    const hideSecrets = () => window.dispatchEvent(new CustomEvent('prism:hide-secrets'));
    window.addEventListener('blur', hideSecrets);
    document.addEventListener('visibilitychange', hideSecrets);
    return () => {
      window.removeEventListener('blur', hideSecrets);
      document.removeEventListener('visibilitychange', hideSecrets);
    };
  }, []);

  const value = useMemo<VaultContextValue>(() => ({
    status,
    error,
    setup: async (password) => {
      setError('');
      try {
        const created = await createVault(password);
        setKey(created);
        setStatus('unlocked');
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '无法创建保险库';
        setError(message);
        throw reason;
      }
    },
    unlock: async (password) => {
      setError('');
      try {
        const unlocked = await unlockVault(password);
        setKey(unlocked);
        setStatus('unlocked');
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '无法解锁保险库';
        setError(message);
        throw reason;
      }
    },
    lock: () => {
      setKey(null);
      setStatus('locked');
      window.dispatchEvent(new CustomEvent('prism:hide-secrets'));
    },
    saveRecord: async (scope, record) => {
      if (!key) throw new Error('请先解锁本机保险库');
      await saveEncryptedRecord(key, scope, record);
    },
    deleteRecord: async (id) => {
      if (!key) throw new Error('请先解锁本机保险库');
      await deleteEncryptedRecord(id);
    },
    loadRecords: async <T,>(scope: string) => {
      if (!key) throw new Error('请先解锁本机保险库');
      return loadEncryptedRecords<T>(key, scope);
    },
    saveBlob: async (scope, blob, name, id) => {
      if (!key) throw new Error('请先解锁本机保险库');
      return saveEncryptedBlob(key, scope, blob, name, id);
    },
    deleteBlob: async (id) => {
      if (!key) throw new Error('请先解锁本机保险库');
      await deleteEncryptedBlob(id);
    },
    loadBlobs: async (scope) => {
      if (!key) throw new Error('请先解锁本机保险库');
      return loadEncryptedBlobs(key, scope);
    },
    exportBackup: exportVaultFile,
    importBackup: async (file) => {
      await importVaultFile(file);
      setKey(null);
      setStatus('locked');
    },
  }), [error, key, status]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used inside VaultProvider');
  return context;
}

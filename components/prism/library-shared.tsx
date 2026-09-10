'use client';
import {
  CircleAlert,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AssetImage, CollectionRecord } from '@/lib/prism-types';
import { ExampleImage } from './example-image';

export function CollectionRail({
  noun,
  collections,
  records,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  noun: string;
  collections: CollectionRecord[];
  records: { collection?: string }[];
  active: string;
  onSelect: (id: string) => void;
  onEdit: (item: CollectionRecord) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="collection-rail">
      <div className="collection-tabs">
        {[
          { id: 'all', name: `全部${noun}` },
          { id: 'unfiled', name: '未分类' },
          ...collections,
        ].map((c) => (
          <div className="collection-tab-group" key={c.id}>
            <button
              type="button"
              className={active === c.id ? 'is-active' : ''}
              onClick={() => onSelect(c.id)}
            >
              <span>{c.name}</span>
              <small>
                {c.id === 'all'
                  ? records.length
                  : records.filter((r) => (r.collection || 'unfiled') === c.id)
                      .length}
              </small>
            </button>
            {!['all', 'unfiled'].includes(c.id) && (
              <div className="collection-tab-tools">
                <button
                  type="button"
                  aria-label={`重命名 ${c.name}`}
                  onClick={() => onEdit(c)}
                >
                  <Pencil />
                </button>
                <button
                  type="button"
                  aria-label={`删除库 ${c.name}`}
                  onClick={() => onDelete(c.id)}
                >
                  <Trash2 />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p>
        <CircleAlert />
        分类可随时重命名或删除；删除分类不会删除资产。
      </p>
    </div>
  );
}

export function LibraryToolbar({
  noun,
  query,
  onQuery,
  count,
}: {
  noun: string;
  query: string;
  onQuery: (value: string) => void;
  count: number;
}) {
  return (
    <div className="library-toolbar">
      <div className="inner-search">
        <Search />
        <Input
          aria-label={`搜索${noun}库`}
          placeholder={`在当前${noun}库中搜索…`}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <div className="result-count">
        <strong>{String(count).padStart(2, '0')}</strong>
        <span>条匹配资产</span>
      </div>
    </div>
  );
}

export function RecordHead({ middle }: { middle: string }) {
  return (
    <div className="record-head">
      <span>例图 / 资产</span>
      <span>{middle}</span>
      <span>备注 / 自定义信息</span>
      <span>操作</span>
    </div>
  );
}

export function RecordExamples({
  images,
  title,
}: {
  images: AssetImage[];
  title: string;
}) {
  return (
    <div className="record-examples">
      {images.slice(0, 1).map((image, index) => (
        <ExampleImage
          key={image.id}
          src={image.url}
          alt={`${title} 例图 ${index + 1}`}
          images={images}
          index={index}
        />
      ))}
      {!images.length && (
        <span className="example-empty">
          <ImageIcon />
          暂无例图
        </span>
      )}
      {images.length > 1 && (
        <span className="example-count">共 {images.length} 张 · 点击查看</span>
      )}
    </div>
  );
}

export function CollectionDialog({
  noun,
  editing,
  onClose,
  onSave,
  busy = false,
}: {
  noun: string;
  editing: { id?: string; name: string } | null;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={!!editing}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="collection-dialog">
        <DialogHeader>
          <DialogTitle>
            {editing?.id ? '重命名' : '新建'}
            {noun}库
          </DialogTitle>
          <DialogDescription>
            分类只是索引；删除分类不会删除其中的资产。
          </DialogDescription>
        </DialogHeader>
        <form
          id={`collection-form-${noun}`}
          className="collection-form"
          key={editing?.id || 'new'}
          onSubmit={onSave}
        >
          <label>
            <span>库名称</span>
            <Input
              name="name"
              defaultValue={editing?.name}
              placeholder="例如：实验性人像"
              required
              autoFocus
              disabled={busy}
            />
          </label>
        </form>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            form={`collection-form-${noun}`}
            type="submit"
            disabled={busy}
          >
            保存分类
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Visual privacy is on by default, including while a saved record is edited. */
export function SecretField({
  label,
  name,
  defaultValue = '',
  value,
  onChange,
  multiline = false,
  required = false,
  placeholder,
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(defaultValue);
  const actual = value ?? draft;
  const change = (next: string) => {
    setDraft(next);
    onChange?.(next);
  };
  useEffect(() => {
    const hide = () => setShow(false);
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);
  return (
    <div
      className={`secret-field ${multiline ? 'secret-field-multiline' : ''}`}
    >
      {multiline ? (
        <>
          <input type="hidden" name={name} value={actual} />
          <textarea
            aria-label={label}
            value={show ? actual : actual ? '••••••••••••••••••••' : ''}
            readOnly={!show}
            required={required}
            placeholder={
              show ? placeholder : '默认隐藏 · 点击眼睛后填写，或直接粘贴'
            }
            onChange={(e) => change(e.target.value)}
            onPaste={(e) => {
              if (!show) {
                e.preventDefault();
                change(e.clipboardData.getData('text/plain'));
              }
            }}
          />
        </>
      ) : (
        <Input
          aria-label={label}
          name={name}
          value={actual}
          onChange={(e) => change(e.target.value)}
          type={show ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          required={required}
          placeholder={placeholder}
        />
      )}
      <button
        type="button"
        className="secret-field-toggle"
        aria-label={`${show ? '隐藏' : '显示'}${label}`}
        aria-pressed={show}
        onClick={() => setShow(!show)}
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

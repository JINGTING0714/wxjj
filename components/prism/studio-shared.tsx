'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CustomField } from '@/lib/prism-types';
import { prismId } from '@/lib/prism-types';

export function SectionHead({
  eyebrow,
  number,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  number: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="studio-head">
      <div>
        <p className="eyebrow">{eyebrow} <span>/ {number}</span></p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="studio-head-actions">{actions}</div>}
    </section>
  );
}

export function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}) {
  const patch = (id: string, value: Partial<CustomField>) => {
    onChange(fields.map((field) => field.id === id ? { ...field, ...value } : field));
  };
  return (
    <fieldset className="custom-fields-editor wide-field">
      <div className="custom-fields-title">
        <div><strong>自定义信息</strong><span>字段名称和内容都由你决定，不限制数量。</span></div>
        <Button onClick={() => onChange([...fields, { id: prismId('field'), label: '', value: '' }])} size="sm" type="button" variant="outline"><Plus /> 添加字段</Button>
      </div>
      {fields.length === 0 ? <p className="custom-fields-empty">例如：版权范围、福利 P、测试批次、推荐参数、购买日期……</p> : (
        <div className="custom-fields-list">
          {fields.map((field) => (
            <div key={field.id}>
              <Input aria-label="自定义字段名称" onChange={(event) => patch(field.id, { label: event.target.value })} placeholder="字段名称" value={field.label} />
              <Input aria-label="自定义字段内容" onChange={(event) => patch(field.id, { value: event.target.value })} placeholder="字段内容" value={field.value} />
              <button aria-label="删除自定义字段" onClick={() => onChange(fields.filter((item) => item.id !== field.id))} type="button"><Trash2 /></button>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export function CustomFieldList({ fields = [] }: { fields?: CustomField[] }) {
  if (!fields.length) return null;
  return (
    <dl className="custom-field-list">
      {fields.slice(0, 4).map((field) => <div key={field.id}><dt>{field.label || '补充'}</dt><dd>{field.value || '—'}</dd></div>)}
      {fields.length > 4 && <div><dt>更多</dt><dd>+{fields.length - 4} 项</dd></div>}
    </dl>
  );
}

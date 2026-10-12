'use client';
import { useEffect, useState } from 'react';
export function IndexJump({
  index,
  count,
  onChange,
  label = '跳转图片序号',
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
  label?: string;
}) {
  const [value, setValue] = useState(String(count ? index + 1 : 0));
  useEffect(() => setValue(String(count ? index + 1 : 0)), [index, count]);
  const commit = () => {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= count)
      onChange(number - 1);
    else setValue(String(count ? index + 1 : 0));
  };
  return (
    <label className="image-jump">
      <input
        aria-label={label}
        type="text"
        inputMode="numeric"
        disabled={!count}
        value={value}
        onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commit();
          }
        }}
      />{' '}
      / {count}
    </label>
  );
}

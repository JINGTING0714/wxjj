'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { longShortCodes } from '@/lib/short-codes';

/** In-page confirmation also works when a browser host cannot show native alerts. */
export function useConfirmation() {
  const [question, setQuestion] = useState<{
    message: string;
    title: string;
    label: string;
  } | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const finish = (answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setQuestion(null);
  };
  useEffect(() => {
    const hide = () => finish(false);
    window.addEventListener('prism:hide-secrets', hide);
    return () => {
      window.removeEventListener('prism:hide-secrets', hide);
      resolver.current?.(false);
    };
  }, []);
  const ask = (message: string, title = '确认操作', label = '确认') =>
    new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setQuestion({ message, title, label });
    });
  return {
    ask,
    confirmShortCodes: async (values: string[]) => {
      const count = longShortCodes(values).length;
      return (
        !count ||
        (await ask(
          `有 ${count} 个短码超过 7 个字符。确认后按原内容保存，不会截断或改变大小写。`,
          '输入确定正确吗？',
          '按原内容保存',
        ))
      );
    },
    dialog: (
      <Dialog
        open={!!question}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <DialogContent
          className="confirmation-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogTitle>{question?.title}</DialogTitle>
          <DialogDescription style={{ whiteSpace: 'pre-line' }}>
            {question?.message}
          </DialogDescription>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => finish(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={() => finish(true)}>
              {question?.label || '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}

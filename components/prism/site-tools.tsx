'use client';
import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SiteTools({
  previous,
  next,
  onPrevious,
  onNext,
}: {
  previous?: string;
  next?: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const copied = (event: Event) => {
      clearTimeout(timer);
      setFeedback(
        (event as CustomEvent<{ message: string; error: boolean }>).detail,
      );
      timer = setTimeout(() => setFeedback(null), 4000);
    };
    window.addEventListener('prism:copy-feedback', copied);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('prism:copy-feedback', copied);
    };
  }, []);
  function scrollToEdge(bottom: boolean) {
    const editor = document.querySelector<HTMLElement>(
      '.editor-active [data-mobile-active="true"]',
    );
    if (editor && editor.scrollHeight > editor.clientHeight + 10)
      editor.scrollTo({
        top: bottom ? editor.scrollHeight : 0,
        behavior: 'smooth',
      });
    else
      window.scrollTo({
        top: bottom ? document.documentElement.scrollHeight : 0,
        behavior: 'smooth',
      });
  }
  return (
    <>
      {feedback && (
        <output
          className={`site-copy-feedback ${feedback.error ? 'is-error' : ''}`}
          aria-live="polite"
        >
          {feedback.message}
        </output>
      )}
      <nav className="site-navigation-tools" aria-label="页面快捷导航">
        <Button
          variant="outline"
          aria-label="回到页面顶部"
          title="回顶"
          onClick={() => scrollToEdge(false)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="outline"
          aria-label="回到页面底部"
          title="回底"
          onClick={() => scrollToEdge(true)}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="outline"
          disabled={!previous}
          aria-label={previous ? `上一个模块：${previous}` : '已到第一个模块'}
          title={previous ? `上一个：${previous}` : '已到第一个模块'}
          onClick={onPrevious}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          disabled={!next}
          aria-label={next ? `下一个模块：${next}` : '已到最后一个模块'}
          title={next ? `下一个：${next}` : '已到最后一个模块'}
          onClick={onNext}
        >
          <ChevronRight />
        </Button>
      </nav>
    </>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function SiteTools() {
  const [scrolled, setScrolled] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scroll = () => setScrolled(window.scrollY > 300);
    const copied = (event: Event) => {
      clearTimeout(timer);
      setFeedback(
        (event as CustomEvent<{ message: string; error: boolean }>).detail,
      );
      timer = setTimeout(() => setFeedback(null), 4000);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('prism:copy-feedback', copied);
    scroll();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('prism:copy-feedback', copied);
    };
  }, []);
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
      {scrolled && (
        <Button
          className="site-back-to-top"
          aria-label="回到页面顶部"
          title="回到顶部"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp />
        </Button>
      )}
    </>
  );
}

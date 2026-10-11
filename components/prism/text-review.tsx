'use client';
import { useMemo } from 'react';
import { reviewIssues, textChanges } from '@/lib/text-review';
export function TextReview({
  before,
  after,
}: {
  before?: string;
  after: string;
}) {
  const issues = useMemo(() => reviewIssues(after), [after]),
    changes = useMemo(
      () =>
        before === undefined || before === after
          ? []
          : textChanges(before, after),
      [before, after],
    );
  if (!issues.length && !changes.length) return null;
  return (
    <details className="text-review" open={issues.length > 0}>
      <summary>
        {issues.length
          ? `${issues.length} 处建议核对`
          : '查看与原识别文字的差异'}
      </summary>
      {issues.map((issue, i) => (
        <p key={i}>
          <mark>{issue.text}</mark> {issue.message}
        </p>
      ))}
      {changes.length > 0 && (
        <>
          <small>
            划线为原文字，绿色为新文字；这里只提示差异，确认后再使用。
          </small>
          <pre className="text-review-diff">
            {changes.map((part, i) =>
              part.kind === 'removed' ? (
                <del key={i}>{part.text}</del>
              ) : part.kind === 'added' ? (
                <ins key={i}>{part.text}</ins>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </pre>
        </>
      )}
    </details>
  );
}

'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { useVault } from './vault-provider';
import {
  clearTasks,
  removeTask,
  subscribeTasks,
  taskSnapshot,
  type TaskView,
} from '@/lib/task-center';
const empty: ReturnType<typeof taskSnapshot> = [];
const labels = {
  running: '处理中',
  completed: '已完成',
  failed: '未完成',
  paused: '已暂停',
};
export function TaskCenter({ onOpen }: { onOpen: (view: TaskView) => void }) {
  const vault = useVault();
  const records = useSyncExternalStore(
      subscribeTasks,
      taskSnapshot,
      () => empty,
    ),
    [open, setOpen] = useState(false);
  const tasks = vault.status === 'unlocked' ? records : empty,
    visibleOpen = open && vault.status === 'unlocked';
  useEffect(() => {
    const hide = () => {
      setOpen(false);
    };
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);
  useEffect(() => {
    clearTasks(true);
    setOpen(false);
  }, [vault.session, vault.status]);
  const openTask = (task: ReturnType<typeof taskSnapshot>[number]) => {
    setOpen(false);
    onOpen(task.view);
    window.dispatchEvent(
      new CustomEvent('prism:task-open', { detail: { id: task.id } }),
    );
  };
  const running = tasks.filter((task) => task.status === 'running').length,
    failed = tasks.filter((task) => task.status === 'failed').length;
  return (
    <section className="task-center" data-open={visibleOpen}>
      <div className="task-center-heading">
        <Button
          size="sm"
          variant="outline"
          aria-expanded={visibleOpen}
          disabled={vault.status !== 'unlocked'}
          aria-controls="prism-task-list"
          onClick={() => setOpen((value) => !value)}
        >
          任务
          {running
            ? ` · ${running} 项处理中`
            : failed
              ? ` · ${failed} 项待处理`
              : ''}
        </Button>
        {visibleOpen && (
          <>
            <span>切换页面可以继续查看进度</span>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              收起任务
            </Button>
          </>
        )}
      </div>
      {visibleOpen && (
        <div id="prism-task-list" className="task-center-list">
          {!tasks.length && (
            <p>
              还没有处理任务。开始识别、清洗、增强、水印或拼图后，会在这里显示进度。
            </p>
          )}
          {tasks.map((task) => (
            <article key={task.id}>
              <strong>{task.title}</strong>
              <span>{labels[task.status]}</span>
              <progress
                aria-label={`${task.title}进度`}
                max={1}
                value={task.progress}
              />
              <small>{task.message}</small>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    openTask(task);
                  }}
                >
                  打开工坊
                </Button>
                {task.status === 'running' && task.stop && (
                  <Button size="sm" variant="outline" onClick={task.stop}>
                    暂停
                  </Button>
                )}
                {(task.status === 'paused' || task.status === 'failed') &&
                  task.retry && (
                    <Button
                      size="sm"
                      disabled={vault.busy}
                      onClick={() => {
                        openTask(task);
                        requestAnimationFrame(() =>
                          requestAnimationFrame(() => task.retry?.()),
                        );
                      }}
                    >
                      继续 / 重试
                    </Button>
                  )}
                {task.status !== 'running' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeTask(task.id)}
                  >
                    移除记录
                  </Button>
                )}
              </div>
            </article>
          ))}
          {!!tasks.length && (
            <Button size="sm" variant="ghost" onClick={() => clearTasks()}>
              清除已完成记录
            </Button>
          )}
          <small>
            刷新或关窗会中断正在处理的任务。已保存的工坊队列可从对应工坊继续。
          </small>
        </div>
      )}
    </section>
  );
}

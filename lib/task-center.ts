export type TaskStatus = 'running' | 'completed' | 'failed' | 'paused';
export type TaskView =
  | 'prompts'
  | 'sales'
  | 'png-cleaner'
  | 'enhancement'
  | 'watermark'
  | 'collage'
  | 'writer'
  | 'poster';
export type TaskRecord = {
  id: string;
  title: string;
  view: TaskView;
  status: TaskStatus;
  progress: number | undefined;
  message: string;
  updated: number;
  retry?: () => void;
  stop?: () => void;
};
let snapshot: readonly TaskRecord[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;
const notify = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    listeners.forEach((listener) => listener());
  }, 100);
};
function put(record: TaskRecord) {
  const index = snapshot.findIndex((item) => item.id === record.id);
  snapshot =
    index < 0
      ? [record, ...snapshot]
      : snapshot.map((item) => (item.id === record.id ? record : item));
  if (snapshot.length > 40) {
    const remove = snapshot.findLastIndex(
      (item) => item.status === 'completed',
    );
    if (remove >= 0) snapshot = snapshot.filter((_, index) => index !== remove);
  }
  notify();
}
export const taskSnapshot = () => snapshot;
export const subscribeTasks = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function startTask(
  id: string,
  title: string,
  view: TaskView,
  actions: { retry?: () => void; stop?: () => void } = {},
) {
  const token = ++sequence;
  put({
    id,
    title,
    view,
    status: 'running',
    progress: 0,
    message: '正在准备…',
    updated: token,
    ...actions,
  });
  const update = (change: Partial<TaskRecord>) => {
    const current = snapshot.find((item) => item.id === id);
    if (current?.updated === token) put({ ...current, ...change });
  };
  return {
    indeterminate: (message = '处理中…') =>
      update({ progress: undefined, message }),
    progress: (progress: number, message = '处理中…') =>
      update({ progress: Math.max(0, Math.min(1, progress)), message }),
    done: (message = '已完成，可到对应工坊查看结果。') =>
      update({
        status: 'completed',
        progress: 1,
        message,
        stop: undefined,
        retry: undefined,
      }),
    fail: (reason: unknown) =>
      update({
        status: 'failed',
        message: reason instanceof Error ? reason.message : String(reason),
        stop: undefined,
      }),
    pause: () =>
      update({
        status: 'paused',
        message: '已暂停，已完成的结果保留。',
        stop: undefined,
      }),
  };
}
export function restoreTask(
  id: string,
  title: string,
  view: TaskView,
  retry: () => void,
) {
  if (!snapshot.some((item) => item.id === id))
    put({
      id,
      title,
      view,
      status: 'paused',
      progress: 0,
      message: '有未完成任务，可以继续。',
      updated: Date.now(),
      retry,
    });
}
export function clearTasks(all = false) {
  snapshot = all
    ? []
    : snapshot.filter(
        (item) =>
          item.status === 'running' ||
          item.status === 'paused' ||
          item.status === 'failed',
      );
  notify();
}
export function removeTask(id: string) {
  snapshot = snapshot.filter(
    (item) => item.id !== id || item.status === 'running',
  );
  notify();
}

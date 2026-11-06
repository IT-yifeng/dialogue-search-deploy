import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { createShare } from '../api/shares';
import type { CreateShareResponse, SearchItem } from '../api/types';
import { buildShareText, copyToClipboard } from '../lib/copyText';
import { pickDisplayLines } from '../lib/displayLines';
import { formatEpisodeCode, formatTime } from '../lib/formatTime';
import { useLangStore } from '../store/lang';
import { MAX_SELECTION, useSelectionStore } from '../store/selection';
import { AlertIcon, CheckIcon, CloseIcon, CopyIcon } from './icons';

/** 手册 §5：留言 ≤ 100 字 */
const NOTE_MAX = 100;

type CopyKind = 'link' | 'text';
type CopyState = { kind: CopyKind; ok: boolean } | null;

interface Props {
  onClose: () => void;
}

/**
 * 分享对话框：预览已选 → 填留言 → 生成链接 → 复制。
 * 由父组件按需挂载（`{open && <ShareDialog />}`），每次打开都是全新状态，不用手动重置。
 * 用原生 <dialog>：焦点陷阱、Esc 关闭、遮罩都是浏览器自带的，不必引入对话框库。
 */
export function ShareDialog({ onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mode = useLangStore((s) => s.mode);
  const items = useSelectionStore((s) => s.items);
  const remove = useSelectionStore((s) => s.remove);

  const [note, setNote] = useState('');
  const [result, setResult] = useState<CreateShareResponse | null>(null);
  // 生成链接那一刻的台词快照：用户点「返回修改」改了勾选后，已生成的链接与文本也不会错位
  const [shared, setShared] = useState<SearchItem[]>([]);
  const [copied, setCopied] = useState<CopyState>(null);

  const mutation = useMutation({
    mutationFn: (body: { lineIds: number[]; note?: string }) => createShare(body),
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    // 已经打开就不再调用：StrictMode 开发期会把 effect 跑两遍，对已打开的 dialog 再 showModal 会抛错。
    // 卸载时不主动 close()：它会触发 close 事件，进而又调 onClose，被 StrictMode 的“模拟卸载”误伤
    if (dialog && !dialog.open) dialog.showModal();
    // 模态期间锁住背景滚动，避免手指在抽屉上滑动时带着底下的结果列表一起滚
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 编辑阶段把最后一条也移除了：没有东西可分享，直接关闭
  useEffect(() => {
    if (result === null && items.length === 0) onClose();
  }, [items.length, result, onClose]);

  // “已复制”提示 2 秒后恢复按钮文案
  useEffect(() => {
    if (copied === null) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const generate = () => {
    const snapshot = items;
    const trimmed = note.trim();
    mutation.mutate(
      { lineIds: snapshot.map((i) => i.id), ...(trimmed !== '' ? { note: trimmed } : {}) },
      {
        onSuccess: (res) => {
          setShared(snapshot);
          setResult(res);
        },
      },
    );
  };

  const copy = async (kind: CopyKind, text: string) => {
    setCopied({ kind, ok: await copyToClipboard(text) });
  };

  const backToEdit = () => {
    setResult(null);
    setCopied(null);
    mutation.reset();
  };

  const error = mutation.error;
  // 400 是请求本身有问题（如某条台词已不存在），后端的文案对用户有用，直接展示；其余按通用故障处理
  const errorMessage =
    error instanceof ApiError && error.status >= 400 && error.status < 500
      ? error.message
      : error instanceof ApiError && error.code === 'NETWORK'
        ? '无法连接服务器，请检查网络后重试'
        : '服务出错了，请稍后重试';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="share-dialog-title"
      onClose={onClose}
      // 点遮罩关闭：dialog 无内边距，点到遮罩时事件目标就是 dialog 本身
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      // 移动端是贴底抽屉，≥640px 变成居中弹窗（手册 §7.3）
      className="m-0 mt-auto max-h-[88vh] w-full max-w-none overflow-hidden rounded-b-none rounded-t-card border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg sm:rounded-card"
    >
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="share-dialog-title" className="text-base font-extrabold">
            {result ? '分享链接已生成' : `分享台词（${items.length} / ${MAX_SELECTION}）`}
          </h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => dialogRef.current?.close()}
            className="rounded-full p-1.5 text-lg text-ink-sub transition hover:bg-surface-muted hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>

        {result ? (
          <div className="space-y-4 overflow-y-auto px-5 py-5">
            <div>
              <label htmlFor="share-link" className="text-meta font-semibold text-ink-sub">
                分享链接
              </label>
              <input
                id="share-link"
                readOnly
                value={result.url}
                // 点一下全选，手动复制也方便
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1.5 w-full rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-ink"
              />
              <p className="mt-1.5 text-meta text-ink-faint">拿到链接的人无需口令即可查看这些台词并播放。</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <CopyButton
                primary
                label="复制链接"
                state={copied?.kind === 'link' ? copied : null}
                onClick={() => void copy('link', result.url)}
              />
              <CopyButton
                label="复制文本"
                state={copied?.kind === 'text' ? copied : null}
                onClick={() => void copy('text', buildShareText(shared))}
              />
            </div>
            <p className="text-meta text-ink-faint">「复制文本」为中英对照，每条附带出处，可直接粘贴到聊天或文档里。</p>
            {copied && !copied.ok && (
              <p role="alert" className="text-meta text-danger">
                复制失败，请手动选中上方链接复制。
              </p>
            )}

            <div className="flex justify-between pt-1 text-sm">
              <button type="button" onClick={backToEdit} className="text-ink-sub transition hover:text-brand-fg">
                返回修改
              </button>
              <button type="button" onClick={() => dialogRef.current?.close()} className="text-ink-sub transition hover:text-brand-fg">
                完成
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <ol className="divide-y divide-line overflow-hidden rounded-card border border-line">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 bg-surface px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-meta tabular-nums text-ink-faint">
                        {formatEpisodeCode(item.episode.season, item.episode.episode)} · {formatTime(item.startMs)}
                      </p>
                      {pickDisplayLines(item, mode).map((l) => (
                        <p
                          key={l.lang}
                          lang={l.lang === 'en' ? 'en' : 'zh-CN'}
                          className={`mt-0.5 text-sm ${l.fallback ? 'text-ink-faint' : l.lang === 'zh' && mode === 'both' ? 'text-ink-sub' : 'font-semibold'}`}
                        >
                          {l.text}
                        </p>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-label={`移除 ${formatEpisodeCode(item.episode.season, item.episode.episode)} ${formatTime(item.startMs)} 这条`}
                      onClick={() => remove(item.id)}
                      className="shrink-0 rounded-full p-1.5 text-ink-faint transition hover:bg-danger-soft hover:text-danger"
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ol>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="share-note" className="text-meta font-semibold text-ink-sub">
                    留言（可选）
                  </label>
                  <span className="text-meta tabular-nums text-ink-faint">
                    {Array.from(note).length} / {NOTE_MAX}
                  </span>
                </div>
                <textarea
                  id="share-note"
                  rows={2}
                  value={note}
                  // 按“字符”截断而不是 maxLength：maxLength 以 UTF-16 码元计，emoji 会被算成 2 个，和后端口径不一致
                  onChange={(e) => setNote(Array.from(e.target.value).slice(0, NOTE_MAX).join(''))}
                  placeholder="给收到链接的人说句话"
                  className="mt-1.5 w-full resize-none rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                />
              </div>

              {mutation.isError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-card border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger"
                >
                  <AlertIcon className="shrink-0 text-lg" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            <footer className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                disabled={mutation.isPending || items.length === 0}
                onClick={generate}
                className="w-full rounded-pill bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-surface-muted disabled:text-ink-faint disabled:shadow-none"
              >
                {mutation.isPending ? '生成中…' : mutation.isError ? '重试生成链接' : '生成链接'}
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}

function CopyButton({
  label,
  state,
  onClick,
  primary = false,
}: {
  label: string;
  state: CopyState;
  onClick: () => void;
  primary?: boolean;
}) {
  const done = state?.ok === true;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold transition active:scale-[0.98] ${
        primary
          ? 'bg-brand-gradient text-white hover:brightness-110'
          : 'border border-line text-ink-sub hover:border-brand-fg hover:text-brand-fg'
      }`}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? '已复制' : label}
    </button>
  );
}

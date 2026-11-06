// 权利声明与投诉入口（手册 §4.2 第 5 条）。不放业务逻辑，只展示文案与可选邮箱链接。
// 邮箱通过 VITE_COMPLAINT_EMAIL 配置：开发默认不设也可通过验收；上线前在 .env 里填真实地址。

const emailRaw = import.meta.env.VITE_COMPLAINT_EMAIL;
const complaintEmail = typeof emailRaw === 'string' ? emailRaw.trim() : '';

interface Props {
  /** 分享页次要信息可略缩小一档 */
  className?: string;
}

export function CopyrightFooter({ className = '' }: Props) {
  return (
    <footer
      className={`mt-10 border-t border-line pt-6 pb-2 text-center text-meta text-ink-sub ${className}`}
    >
      <p className="leading-relaxed">
        素材仅供个人学习交流；转载请注明出处。如有侵权，请
        {complaintEmail !== '' ? (
          <a href={`mailto:${complaintEmail}`} className="text-brand-fg underline-offset-2 hover:underline">
            邮件联系投诉
          </a>
        ) : (
          <span>联系站点运营者（部署时配置环境变量 VITE_COMPLAINT_EMAIL）</span>
        )}
        ，收到通知后 48 小时内处理。
      </p>
    </footer>
  );
}

import { highlightSegments } from '../lib/highlight';

interface Props {
  text: string;
  terms: string[];
}

// 用 React 节点渲染 <mark>，不使用 dangerouslySetInnerHTML：台词里即使带 HTML 也只会当文本显示
export function HighlightText({ text, terms }: Props) {
  return (
    <>
      {highlightSegments(text, terms).map((seg, i) =>
        seg.hit ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

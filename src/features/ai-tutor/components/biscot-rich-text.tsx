import { useMemo } from 'react';
import { renderBiscotMarkdown } from './biscot-markdown';

/** Chỉ render kết quả đã escape HTML và đã xử lý bằng thư viện Markdown/KaTeX. */
export function BiscotRichText({ text }: { text: string }) {
  const markup = useMemo(() => renderBiscotMarkdown(text), [text]);
  return <div className="utt-v9-rich-text" dangerouslySetInnerHTML={{ __html: markup }} />;
}

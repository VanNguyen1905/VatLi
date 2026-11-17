import { renderToString } from '@/vendor/utt-katex';
import { uttMarked, UttMarkedRenderer } from '@/vendor/utt-marked';
import { fixBrokenVietnamese } from '../../../../public/labvirt/lab-v11/biscot-unicode.js';

/**
 * Render câu trả lời Biscot bằng Markdown và KaTeX ngay trong React.
 * - Không chèn DOM thủ công sau khi React đã render.
 * - Mọi HTML do AI trả về đều bị vô hiệu hóa trước khi phân tích Markdown.
 * - Chỉ liên kết HTTP(S) hoặc email được phép mở; ảnh từ AI không được tự tải.
 * - KaTeX chạy tại máy người dùng, không gửi dữ liệu sang máy chủ khác.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const renderer = new UttMarkedRenderer();
renderer.html = (html: string) => escapeHtml(String(html));
renderer.link = (href: string | null, title: string | null, label: string) => {
  const url = String(href ?? '').trim();
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return label;
  const caption = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(url)}"${caption} target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
};
renderer.image = (_href: string | null, _title: string | null, alt: string) => escapeHtml(alt || '[Hình minh họa]');

function latexHtml(expression: string, displayMode: boolean): string {
  try {
    return renderToString(expression, {
      displayMode,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      maxExpand: 500,
      maxSize: 15,
      output: 'html',
    });
  } catch {
    // Nội dung toán học bất hợp lệ vẫn hiện dưới dạng text, không làm vỡ giao diện.
    return `<code class="utt-v9-invalid-math">${escapeHtml(expression)}</code>`;
  }
}

/**
 * Trích công thức trước khi Markdown xử lý để dấu * _ { } trong LaTeX
 * không bị Markdown hiểu thành chữ nghiêng, danh sách hoặc dấu định dạng.
 */
export function renderBiscotMarkdown(raw: string): string {
  if (!raw) return '';
  raw=fixBrokenVietnamese(raw);
  const placeholders: string[] = [];
  const token = (formula: string, display: boolean) => {
    const index = placeholders.length;
    const cls = display ? 'utt-v9-math-block' : 'utt-v9-math-inline';
    placeholders.push(`<span class="${cls}">${latexHtml(formula, display)}</span>`);
    return `UTTMATHTOKEN${index}END`;
  };

  // Không xử lý LaTeX nằm trong code fence hoặc code inline.
  const codeProtected = raw.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  const extracted = codeProtected.map((section, i) => {
    if (i % 2 === 1) return section;
    const delimited = section.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([^\n]*?)\\\)|(?<!\\)\$([^$\n]+)\$/g,
      (_whole, a: string | undefined, b: string | undefined, c: string | undefined, d: string | undefined) =>
        token(a ?? b ?? c ?? d ?? '', a !== undefined || b !== undefined));
    // Gemini đôi lúc viết LaTeX không có dấu $; vẫn phải hiện phân số đúng.
    const fractions = delimited.replace(/\\(?:frac|dfrac|tfrac)\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*\{(?:[^{}]|\{[^{}]*\})*\}/g,
      (formula) => token(formula, false));
    return fractions.replace(/\\(?:pi|mu|Omega|alpha|beta|gamma|Delta|theta|lambda|cdot|times|sqrt|vec)(?:\{[^{}]*\})?(?:_(?:\{[^{}]*\}|[A-Za-z0-9]))?/g,
      (formula) => token(formula, false));
  }).join('');
  // Mã HTML của AI bị escape trước khi đưa vào Marked; không cho phép script/event handler.
  const safelyEscaped = escapeHtml(extracted);
  const parsed = uttMarked(safelyEscaped, {
    renderer,
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
    smartypants: false,
  });
  return String(parsed).replace(/UTTMATHTOKEN(\d+)END/g, (_whole, id: string) =>
    placeholders[Number(id)] ?? '');
}


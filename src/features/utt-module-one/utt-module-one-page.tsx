import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores';

/**
 * Bài 1 – Phần 1: màn thực hành độc lập, nhúng trong bố cục React hiện có.
 * - KHÔNG thay đổi luồng đăng nhập hay các bài thí nghiệm đang hoạt động.
 * - Tiến độ được gắn với UID Firebase trong localStorage của trình duyệt.
 * - Gửi UID sau khi iframe tải xong, không đưa UID vào đường dẫn URL.
 */
export function UTTModuleOnePage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const user = useAuthStore(state => state.user);
  const [progress, setProgress] = useState<number | null>(null);
  const uid = user?.uid ?? 'guest';

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const message: unknown = event.data;
      if (typeof message !== 'object' || !message) return;
      const m = message as {type?: unknown;completed?: unknown;total?: unknown};
      if (m.type === 'utt-module-progress' && typeof m.completed === 'number' && m.total === 18 && m.completed >= 0 && m.completed <= 18) {
        setProgress(m.completed);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function onFrameLoad() {
    iframeRef.current?.contentWindow?.postMessage({ type: 'utt-host-init', uid }, window.location.origin);
  }

  // Khi Firebase đăng nhập/đăng xuất mà iframe không reload, vẫn cần chuyển UID.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'utt-host-init', uid }, window.location.origin);
  }, [uid]);

  return (
    <section aria-label="Module 1 – Bài 1 – Phòng thí nghiệm 3D" className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Module 1 · Phòng thí nghiệm điện tử</h1>
          <p className="text-xs text-muted-foreground">Bài 1 gồm 4 phần lớn · Phần 1 có 3 nhiệm vụ và 18 trường hợp đo</p>
        </div>
        <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
          {progress === null ? 'Tiến độ lưu trên thiết bị' : `Phần 1: ${progress}/18 trường hợp`}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        onLoad={onFrameLoad}
        src="/utt-module-one/index.html"
        title="UTT Lab · Module 1 · Phòng thí nghiệm 3D"
        className="block w-full min-h-[740px] rounded-xl border border-border bg-[#07101f]"
        style={{ height: 'min(84vh, 1100px)' }}
        loading="eager"
        allow="fullscreen"
      />
    </section>
  );
}

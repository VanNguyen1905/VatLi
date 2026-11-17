import { useEffect, useState } from 'react';

/** Telemetry chẩn đoán: KHÔNG dùng để tự cấp điểm, đóng nguồn hoặc thay đổi mạch. */
export type LabLiveContext = {
  source: 'utt-module' | 'utt-dmm' | 'labvirt-v8';
  lessonId?: string;
  screen?: string;
  task?: string;
  stepId?: string;
  selectedComponent?: string;
  componentDefect?: string;
  selectedCount?: number;
  completed?: number;
  total?: number;
  mode?: string;
  redJack?: string;
  blackJack?: string;
  redPin?: string | null;
  blackPin?: string | null;
  lcd?: string;
  lcdState?: string;
  measurementValid?: boolean | null;
  measurementReason?: string;
  learningMode?: string;
  measurementValue?: number;
  nominalValue?: number;
  tolerancePercent?: number;
  boardMounted?: boolean;
  sceneReady?: boolean;
  powered?: boolean;
  lastAction?: string;
};

const ALLOWED = new Set(['utt-module', 'utt-dmm', 'labvirt-v8']);
const KEYS = ['lessonId','screen','task','stepId','selectedComponent','componentDefect','selectedCount','completed','total','mode','redJack','blackJack','redPin','blackPin','lcd','lcdState','measurementValid','measurementReason','boardMounted','sceneReady','powered','lastAction','learningMode','measurementValue','nominalValue','tolerancePercent'] as const;
const RECENT_MS = 12000;

/** Chỉ lắng nghe frame cùng origin, dữ liệu whitelisted, không đọc thông tin cá nhân. */
export function useLabLiveContext(active: boolean) {
  const [state, setState] = useState<LabLiveContext | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [clock, setClock] = useState(()=>Date.now());
  useEffect(() => {
    if (!active) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.source || event.source === window) return;
      const data: unknown = event.data;
      if (!data || typeof data !== 'object') return;
      const packet = data as Record<string, unknown>;
      if (packet.type !== 'biscot:lab-context' || !ALLOWED.has(String(packet.source))) return;
      if (!packet.state || typeof packet.state !== 'object' || Array.isArray(packet.state)) return;
      const raw = packet.state as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      for (const key of KEYS) {
        const value = raw[key];
        if (value === null && (key === 'redPin' || key === 'blackPin')) normalized[key] = null;
        else if (typeof value === 'string') normalized[key] = value.slice(0, 120);
        else if (typeof value === 'boolean') normalized[key] = value;
        else if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e6) normalized[key] = value;
      }
      // Sensor set từ iframe không chứa request hành động, chỉ là snapshot.
      setState(old => {
        const source = String(packet.source) as LabLiveContext['source'];
        const sameLesson=!old?.lessonId||!normalized.lessonId||old.lessonId===normalized.lessonId;
        const merged = { ...(sameLesson?old:null), ...normalized, source } as LabLiveContext;
        // Khi nhận telemetry DMM, giữ ngữ cảnh bước của wrapper; ngược lại giữ dữ liệu đo.
        return merged;
      });
      setUpdatedAt(Date.now());
    };
    window.addEventListener('message', onMessage);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { window.removeEventListener('message', onMessage); window.clearInterval(timer); };
  }, [active]);
  return { context: active?state:null, live: active && !!state && updatedAt>0 && clock - updatedAt < RECENT_MS, updatedAt:active?updatedAt:0 };
}

/** Giúp đỡ thao tác xác định được từ state, không giả đây là kết quả của mô hình Gemini. */
export function diagnosticHint(question: string, context: LabLiveContext | null, live: boolean): string | null {
  const text = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const troubleshooting = /(o\.l|ol\b|khong (hien|ra|co) so|dong ho|que (do|den)|cam que|cam vao dau|do dien tro|chi (cho|giup)|sai o dau|buoc tiep)/.test(text);
  if (!troubleshooting) return null;
  if (!live || !context) return 'Mình chưa nhận được trạng thái trực tiếp từ phòng thí nghiệm. Hãy mở phần thực hành và chờ trạng thái “Đang theo dõi”; mình sẽ chỉ dựa vào dữ liệu được gửi về.';
  if (context.screen && !['practice', 'lab', 'experiment'].includes(context.screen) && !context.mode) {
    if (context.screen === 'kit') return `Bạn đang ở bước chọn bộ dụng cụ (${context.selectedCount ?? 0}/6). Chọn đủ R1, R2, R3, C1, C2 và L rồi xác nhận để bắt đầu đo.`;
    return 'Bạn đang ở màn chuẩn bị/lộ trình. Hãy chọn Phần 1 và vào màn đo để mình kiểm tra đồng hồ theo từng thao tác.';
  }
  const mode = context.mode;
  if (mode === 'OFF') return 'Mình thấy núm DMM đang OFF. Khi đo điện trở, hãy tắt nguồn mạch, chọn Ω; khi đo tụ đã xả điện, chọn C.';
  if(context.powered===true && ['OHM','CAP','CONT'].includes(mode??''))return 'Nguồn mạch đang bật. Hãy tắt nguồn và xả tụ an toàn trước khi đo Ω/C hoặc thông mạch.';
  if (context.source === 'labvirt-v8' && context.boardMounted === false) return 'Mẫu linh kiện đang ở ngoài bảng trắng. Hãy mở Khay thực hành và chọn “Đưa linh kiện lên breadboard”, sau đó chạm hai chân được tô sáng.';
  if (context.source === 'labvirt-v8') {
    if (context.blackJack !== 'COM') return 'Jack đen chưa được xác nhận tại COM. Hãy chọn đầu jack đen rồi cắm vào cổng COM của DMM.';
    if (context.redJack !== 'VOHM') return 'Jack đỏ chưa được xác nhận tại VΩ. Hãy chọn đầu jack đỏ rồi cắm vào cổng VΩ của DMM.';
  }
  if (!context.blackPin) return 'Mình chưa nhận thấy que đen tiếp xúc chân linh kiện. Hãy chạm đầu kim đen vào PIN_A.';
  if (!context.redPin) return 'Mình chưa nhận thấy que đỏ tiếp xúc chân linh kiện. Hãy chạm đầu kim đỏ vào PIN_B.';
  if (context.redPin === context.blackPin) return 'Hai que đang ở cùng một nút/chân. Hãy đặt chúng trên hai chân khác nhau của linh kiện cần đo.';
  if (mode && context.selectedComponent && /^C_/.test(context.selectedComponent) && mode === 'OHM') return 'Bạn đang đo tụ bằng Ω. Tài liệu yêu cầu đo điện dung ở thang C khi tụ đã xả điện. O.L trên Ω không chứng tỏ tụ bị đứt.';
  if (context.measurementValid === true) return `DMM đã có phép đo hợp lệ trên ${context.selectedComponent ?? 'linh kiện'}: ${context.lcd ?? 'kiểm tra màn LCD'}. Giá trị lấy từ mô phỏng, không phải đo vật lý ngoài đời.`;
  if (context.lcd === 'O.L' || context.lcd === 'OL') return `Màn DMM đang hiện O.L (${context.lcdState || context.measurementReason || 'chưa rõ nguyên nhân'}). O.L có thể chỉ mạch hở hoặc vượt thang. Kiểm tra tình trạng linh kiện và thang đo, không tự kết luận linh kiện hỏng.`;
  return `Mình đang thấy chế độ ${mode ?? 'chưa xác định'}, ${context.selectedComponent ?? 'chưa chọn linh kiện'}, màn ${context.lcd ?? 'chưa nhận được'}. Hãy cho mình biết bước bạn đang khó hiểu để chỉ chính xác hơn.`;
}

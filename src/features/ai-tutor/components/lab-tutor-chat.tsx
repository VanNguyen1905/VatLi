import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { LoaderCircle, Send, Sparkles, X, Footprints, PartyPopper, Hand, Volume2, VolumeX } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { useOwnerAccess } from '@/features/admin/hooks/use-owner-access';
import {biscotErrorMessage} from '@/services/firebase/biscot-error';
import { askBiscotGemini, type BiscotMessage } from '@/features/ai-tutor/live/biscot-knowledge-service';
import { useLabLiveContext, diagnosticHint } from '../live/lab-live-context';
import { BiscotAvatar, type BiscotMood } from './biscot-avatar-motion';
const BiscotRichText=lazy(()=>import('./biscot-rich-text').then(module=>({default:module.BiscotRichText})));

const LAB_PATH = /^\/(roadmap|module-1|experiments\/[^/]+\/practicals\/[^/]+|lab\/preparation\/[^/]+)/;
const STUDENT_SUGGESTIONS = [
  'Biscot ơi, bước tiếp theo mình nên làm gì?',
  'Tại sao đồng hồ vạn năng hiện O.L?',
  'Que đỏ và que đen phải chạm vào đâu?',
  'Tại sao phải xả tụ trước khi đo điện dung?',
];
const TEACHER_SUGGESTIONS = [
  'Tổng quan lớp của tôi hiện tại',
  'Ai đang trực tuyến?',
  'Sinh viên nào chưa hoàn thành bài 1.1?',
];
function contextFromPath(pathname: string) {
  const practical = pathname.match(/^\/experiments\/([\w-]+)\/practicals\/([\w-]+)/);
  if (practical) return { experimentId: practical[1], practicalId: practical[2] };
  const session = pathname.match(/^\/lab\/preparation\/([\w-]+)/);
  if (session) return { sessionId: session[1] };
  return {};
}
function requestedMotion(value: string): BiscotMood | null {
  const s = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  if (/(nhay mua|mua cho|dance|chay nhay)/.test(s)) return 'dance';
  if (/(chay di|chay cho|chay mot vong)/.test(s)) return 'run';
  if (/(nhay di|nhay cho|bat nhay)/.test(s)) return 'jump';
  if (/(vay tay|chao minh|chao toi)/.test(s)) return 'wave';
  return null;
}

/** Mascot thật của web chính, trạng thái do các iframe thí nghiệm gửi về, không phải AI tự đoán. */
export function LabTutorChat() {
  const uid=useAuthStore(s=>s.user?.uid||'guest');
  const demo=useAuthStore(s=>s.isDemo);
  const pathname=useLocation().pathname;
  return <TutorSession key={`${uid}:${demo}:${pathname}`}/>;
}
function TutorSession(){
  const user = useAuthStore(s => s.user);
  const isDemo = useAuthStore(s => s.isDemo);
  const isOwner = useOwnerAccess();
  const location = useLocation();
  const inLab = LAB_PATH.test(location.pathname);
  const { context: lab, live } = useLabLiveContext(inLab);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<BiscotMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mood, setMood] = useState<BiscotMood>('idle');
  const [voice, setVoice] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const active=useRef(true);
  const moodTimer = useRef<number | null>(null);
  const previousCompleted = useRef<number | undefined>(undefined);
  const context = useMemo(() => contextFromPath(location.pathname), [location.pathname]);
  const suggestions = isOwner ? TEACHER_SUGGESTIONS : STUDENT_SUGGESTIONS;
  const canChat = Boolean(user && !isDemo);

  const animate = useCallback((next: BiscotMood, ms = 2400) => {
    if (moodTimer.current !== null) window.clearTimeout(moodTimer.current);
    setMood(next);
    moodTimer.current = window.setTimeout(() => setMood('idle'), ms);
  }, []);
  useEffect(() => {active.current=true;return()=>{active.current=false;if (moodTimer.current !== null) window.clearTimeout(moodTimer.current); window.speechSynthesis?.cancel();};}, []);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, open]);
  useEffect(() => {
    if (!live || typeof lab?.completed !== 'number') return;
    const previous = previousCompleted.current;
    if (previous !== undefined && lab.completed > previous) animate('success', 2600);
    previousCompleted.current = lab.completed;
  }, [lab?.completed, live, animate]);

  function speak(text: string) {
    if (!voice || !('speechSynthesis' in window)) return;
    const clean = text.replace(/[#*`]/g, '').slice(0, 550);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'vi-VN'; utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }
  function showReply(reply: string, gesture: BiscotMood) {
    setMessages(old => [...old, { role: 'assistant', text: reply }]);
    animate(gesture);
    speak(reply);
  }
  async function send(raw: string) {
    const clean = raw.trim();
    if (!clean || inFlight.current) return;
    if (clean.length > 900) { setError('Câu hỏi không được vượt quá 900 ký tự.'); return; }
    setError(''); setQuestion('');
    const prior = messages;
    setMessages(old => [...old, { role: 'user', text: clean }]);
    const requested = requestedMotion(clean);
    if (requested) { showReply('Biscot thực hiện động tác rồi đây! ✨ Mình tiếp tục thí nghiệm nhé.', requested); return; }
    const hint = inLab ? diagnosticHint(clean, lab, live) : null;
    if (hint) { showReply(hint, /chưa|sai|thiếu|OFF|O\.L/.test(hint) ? 'point' : 'wave'); return; }
    if (!user || !canChat) { showReply('Bạn cần đăng nhập tài khoản Firebase để hỏi AI trực tuyến. Hướng dẫn cơ bản theo trạng thái vẫn có thể dùng trong phòng lab.', 'warn'); return; }
    inFlight.current = true; setBusy(true); animate('think', 10000);
    try {
      const reply = await askBiscotGemini(user, clean, prior, { ...context, ...(live && lab ? { lab, labIsLive: true } : {}) });
      if(!active.current)return;
      showReply(reply, 'speak');
    } catch (err) {
      if(!active.current)return;
      setError(biscotErrorMessage(err)); animate('warn');
      showReply('Nếu bạn đang làm DMM, hãy hỏi “bước tiếp theo” hoặc “tại sao O.L” để dùng hướng dẫn theo trạng thái mà không cần kết nối AI.', 'point');
    } finally { inFlight.current = false; if(active.current)setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(question); }
  const modeLabel = lab?.mode && lab.mode !== 'OFF' ? lab.mode : lab?.mode ?? '—';
  return <div className="pointer-events-none fixed bottom-[82px] right-3 z-[70] flex flex-col items-end gap-2 lg:bottom-5 lg:right-6">
    {open && <section role="dialog" aria-label="Trò chuyện cùng AI Biscot" className="pointer-events-auto flex h-[min(650px,calc(100dvh-164px))] min-h-[320px] w-[min(445px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px] border border-sky-400/30 bg-card text-foreground shadow-[0_24px_90px_rgba(19,60,110,.36)]">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-[#091d3a] via-[#123a73] to-[#125e92] px-3 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          <BiscotAvatar mood={mood} className="h-12 w-12 shrink-0" />
          <div className="min-w-0"><h2 className="truncate text-base font-extrabold">AI Biscot <Sparkles className="mb-0.5 inline h-3.5 w-3.5 text-amber-200"/></h2><p className="truncate text-[11px] text-sky-100">Trợ giảng của Virtual Lab Academy</p></div>
        </div>
        <button type="button" aria-label="Đóng AI Biscot" onClick={() => setOpen(false)} className="rounded-full p-2 transition hover:bg-white/20"><X className="h-4 w-4"/></button>
      </header>
      {inLab && <div className="border-b border-sky-400/15 bg-[#0b1c35] px-3 py-2 text-[11px] text-sky-100" aria-live="polite">
        <span className={`mr-2 inline-block h-2 w-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-amber-400'}`}/>
        <strong>{live ? 'Đang theo dõi thao tác' : 'Chưa nhận trạng thái phòng lab'}</strong>
        {live && <span className="ml-2">{lab?.selectedComponent ?? 'Chưa chọn linh kiện'} · {modeLabel} · {lab?.lcd ?? 'Chưa có LCD'}{lab?.completed !== undefined ? ` · ${lab.completed}/${lab.total ?? 18}` : ''}</span>}
      </div>}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/5 p-3">
            <BiscotAvatar mood={mood} large className="h-28 w-28 shrink-0"/>
            <div className="space-y-1"><p className="text-sm font-extrabold">Chào bạn, mình là Biscot! ✨</p><p className="text-xs leading-relaxed text-muted-foreground">Mình có thể chỉ từng bước, kiểm tra trạng thái DMM và giải thích kết quả. Mình không tự sửa số đo hoặc cắm mạch thay bạn.</p></div>
          </div>
          {suggestions.map(s => <button key={s} type="button" disabled={busy} onClick={() => void send(s)} className="block w-full rounded-xl border border-border px-3 py-2.5 text-left text-xs leading-relaxed hover:border-sky-400 hover:bg-sky-500/5 disabled:opacity-50">{s}</button>)}
        </div>}
        {messages.map((m, i) => <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {m.role === 'assistant' && <BiscotAvatar mood={mood} className="mr-1.5 mt-0.5 h-8 w-8 shrink-0"/>}
          <div className={`max-w-[87%] break-words rounded-2xl px-3 py-2.5 text-[13px] leading-relaxed ${m.role === 'user' ? 'rounded-br-sm bg-blue-700 text-white' : 'rounded-bl-sm border border-border bg-surface-elevated text-foreground'}`}>{m.role === 'assistant' ? <Suspense fallback={<span>Đang định dạng câu trả lời…</span>}><BiscotRichText text={m.text}/></Suspense> : <span className="whitespace-pre-wrap">{m.text}</span>}</div>
        </div>)}
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin"/> Biscot đang suy nghĩ theo bài học...</div>}
        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">{error}</p>}
        {!canChat && <p className="text-xs text-amber-500">AI Gemini trực tuyến cần đăng nhập Firebase. Hướng dẫn DMM theo trạng thái và animation vẫn dùng được.</p>}
        <div ref={endRef}/>
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-3 pb-2 pt-2">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => animate('wave')} className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-sky-500/10"><Hand className="mr-1 inline h-3 w-3"/>Chào</button>
          <button type="button" onClick={() => animate('run', 2800)} className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-sky-500/10"><Footprints className="mr-1 inline h-3 w-3"/>Chạy</button>
          <button type="button" onClick={() => animate('jump', 2000)} className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-sky-500/10">Nhảy</button>
          <button type="button" onClick={() => animate('dance', 4800)} className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-sky-500/10"><PartyPopper className="mr-1 inline h-3 w-3"/>Nhảy múa</button>
          <button type="button" aria-label={voice ? 'Tắt đọc' : 'Bật đọc'} onClick={() => { setVoice(v => !v); window.speechSynthesis?.cancel(); }} className="ml-auto rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-sky-500/10">{voice ? <Volume2 className="h-3.5 w-3.5"/> : <VolumeX className="h-3.5 w-3.5"/>}</button>
        </div>
        <form onSubmit={submit} className="flex gap-2"><input aria-label="Hỏi AI Biscot" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-sky-500" value={question} onChange={e => setQuestion(e.target.value)} maxLength={900} disabled={busy} placeholder="Ví dụ: Vì sao DMM hiện O.L?"/><button aria-label="Gửi câu hỏi" type="submit" disabled={busy || !question.trim()} className="rounded-xl bg-blue-700 p-2.5 text-white transition hover:bg-blue-600 disabled:opacity-50"><Send className="h-4 w-4"/></button></form>
      </div>
    </section>}
    <button type="button" aria-label={open ? 'Thu nhỏ AI Biscot' : 'Mở AI Biscot'} aria-expanded={open} onClick={() => { setOpen(v => !v); animate('wave'); }} className="pointer-events-auto group flex items-center gap-2.5 rounded-full border border-sky-300/50 bg-gradient-to-r from-[#0c2c63] to-[#1465ac] py-1.5 pl-1.5 pr-4 text-white shadow-[0_8px_25px_rgba(16,75,150,.38)] transition-transform hover:scale-[1.035] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 active:scale-95"><BiscotAvatar mood={mood} className="h-12 w-12 sm:h-14 sm:w-14"/><span className="flex flex-col items-start"><span className="whitespace-nowrap text-sm font-extrabold">AI Biscot ✨</span><span className="whitespace-nowrap text-[10px] font-medium text-sky-100">{open ? 'Thu nhỏ hội thoại' : 'Hỏi mình nhé!'}</span></span></button>
  </div>;
}

/**
 * Màn hình khởi động — Lab Thực hành Bộ môn Vật lý Công nghệ.
 * Giữ nguyên API LoadingScreen({ message }) cho ProtectedRoute/Firebase Auth.
 * Lưu file này tại src/components/layout/loading-screen.tsx của dự án React.
 * KHÔNG mở và kiểm tra file TSX độc lập bên ngoài thư mục dự án.
 */

import {useEffect,useState} from 'react';

interface LoadingScreenProps {
  message?: string;
}

const styleSheet = String.raw`
  .vl52-loading {
    position: fixed;
    inset: 0;
    z-index: 9999;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
    color: #0b3269;
    background:
      radial-gradient(ellipse 53% 48% at 49% 41%, rgba(245, 253, 255, .99), transparent 80%),
      radial-gradient(ellipse 88% 75% at 53% 44%, #dff4ff 0%, #a5c9df 66%, transparent 100%),
      linear-gradient(145deg, #537b9b 0%, #d0edf9 34%, #cde8f8 65%, #567fa1 100%);
  }
  .vl52-loading,
  .vl52-loading * { box-sizing: border-box; }
  .vl52-loading::before {
    content: "";
    pointer-events: none;
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(circle at 10% 29%, rgba(255,255,255,.96) 0 2px, transparent 4px),
      radial-gradient(circle at 82% 23%, rgba(255,255,255,.82) 0 2px, transparent 5px),
      radial-gradient(circle at 18% 75%, rgba(255,255,255,.8) 0 2px, transparent 5px),
      radial-gradient(circle at 89% 68%, rgba(255,255,255,.9) 0 3px, transparent 5px),
      radial-gradient(ellipse at center, transparent 38%, rgba(19, 66, 106, .25) 100%);
  }
  .vl52-loading__science {
    position: absolute;
    z-index: -1;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: .76;
  }
  .vl52-loading__content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: min(100%, 650px);
    padding: 24px 22px 52px;
    text-align: center;
    transform: translateY(-2%);
  }
  .vl52-loading__content::before {
    content: "";
    position: absolute;
    z-index: -1;
    top: 4%; left: 7%; right: 7%; bottom: 3%;
    background: radial-gradient(ellipse at 50% 46%, rgba(255,255,255,.58), transparent 71%);
    filter: blur(14px);
    pointer-events: none;
  }
  .vl52-loading__logo {
    display: block;
    width: clamp(136px, 26vmin, 194px);
    height: auto;
    overflow: visible;
    filter: drop-shadow(0 6px 9px rgba(10, 77, 159, .13));
    animation: vl52-logo-float 6s ease-in-out infinite;
  }
  .vl52-loading__title {
    margin: 12px 0 0;
    color: #07316e;
    font-size: clamp(27px, 5.3vmin, 45px);
    font-weight: 850;
    line-height: 1.13;
    letter-spacing: -.035em;
    text-shadow: 0 2px 2px rgba(255, 255, 255, .95);
  }
  .vl52-loading__subtitle {
    margin: 2px 0 0;
    color: #0b2f62;
    font-size: clamp(14px, 2.9vmin, 23px);
    font-weight: 780;
    line-height: 1.32;
    letter-spacing: .02em;
    text-shadow: 0 1px 2px rgba(255, 255, 255, .85);
  }
  .vl52-loading__progress-track {
    position: relative;
    width: clamp(176px, 36vmin, 230px);
    height: 8px;
    margin-top: clamp(22px, 4vmin, 31px);
    overflow: hidden;
    border-radius: 999px;
    background: linear-gradient(90deg, #1e4ca2 0%, #a1bddd 100%);
    box-shadow: 0 0 1px 1px rgba(255,255,255,.75),
                0 2px 11px rgba(10,105,218,.22);
  }
  .vl52-loading__progress-track::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 1px 2px rgba(255,255,255,.5);
  }
  .vl52-loading__progress-indicator {
    position: absolute;
    inset: 0 auto 0 0;
    width: 45%;
    border-radius: inherit;
    background: linear-gradient(90deg, #0073f5 5%, #0cbdf9 56%, #65f9ff 100%);
    box-shadow: 0 0 8px #34d9ff, 0 0 18px rgba(48,166,255,.65);
    animation: vl52-progress-slide 1.9s ease-in-out infinite alternate;
  }
  .vl52-loading__message {
    max-width: min(88vw, 520px);
    margin: 15px 0 0;
    color: #0a4693;
    font-size: clamp(12px, 1.9vmin, 16px);
    font-weight: 520;
    line-height: 1.5;
    overflow-wrap: break-word;
  }
  .vl52-loading__floor {
    position: absolute;
    bottom: 3%;
    left: 50%;
    z-index: -1;
    width: min(84vw, 740px);
    height: clamp(58px, 14vmin, 130px);
    border: 2px solid rgba(255,255,255,.45);
    border-radius: 50%;
    transform: translateX(-50%) rotateX(63deg);
    box-shadow: 0 0 18px rgba(93,191,250,.3), inset 0 0 17px rgba(255,255,255,.7);
    pointer-events: none;
  }
  .vl52-loading__floor::after {
    content: "";
    position: absolute;
    inset: 17% 15%;
    border: 2px solid rgba(228,252,255,.85);
    border-radius: 50%;
    box-shadow: 0 0 20px rgba(70,177,252,.42);
  }
  @keyframes vl52-progress-slide {
    from { transform: translateX(0%); }
    to   { transform: translateX(124%); }
  }
  @keyframes vl52-logo-float {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-5px); }
  }
  @media (max-width: 480px) {
    .vl52-loading__content { padding-left: 14px; padding-right: 14px; }
    .vl52-loading__subtitle { letter-spacing: 0; }
    .vl52-loading__floor { bottom: 8%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .vl52-loading__logo,
    .vl52-loading__progress-indicator { animation: none; }
  }
`;

/** SVG nét xanh: quyển sách mở, quỹ đạo nguyên tử và bánh răng công nghệ. */
function LaboratoryMark() {
  return (
    <svg
      className="vl52-loading__logo"
      width="194"
      height="148"
      viewBox="0 0 194 148"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="vl52-book-gradient" x1="21" y1="100" x2="170" y2="137" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0756B6" />
          <stop offset=".5" stopColor="#22BDF8" />
          <stop offset="1" stopColor="#063D8D" />
        </linearGradient>
        <linearGradient id="vl52-atom-gradient" x1="59" y1="20" x2="135" y2="91" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0046A9" />
          <stop offset=".55" stopColor="#00A8F6" />
          <stop offset="1" stopColor="#004184" />
        </linearGradient>
        <radialGradient id="vl52-electron-gradient" cx=".28" cy=".22" r=".85">
          <stop stopColor="#D1FFFF" />
          <stop offset=".3" stopColor="#29BFFB" />
          <stop offset="1" stopColor="#0039A7" />
        </radialGradient>
        <filter id="vl52-illustration-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      {/* Hào quang phía sau biểu tượng */}
      <ellipse cx="97" cy="69" rx="74" ry="58" stroke="#7BDEFF" strokeWidth="2" opacity=".33" filter="url(#vl52-illustration-glow)" />
      {/* Những trang sách mở, tách riêng để tạo cảm giác nổi 3D */}
      <path d="M18 106L30 72Q67 67 97 93Q127 67 164 72L177 106Q132 101 97 125Q61 101 18 106Z" fill="#DDF8FF" stroke="#08468F" strokeWidth="5" strokeLinejoin="round" />
      <path d="M30 73L23 100Q64 96 95 116V95Q66 70 30 73Z" fill="#FFFFFF" stroke="url(#vl52-book-gradient)" strokeWidth="3.8" strokeLinejoin="round" />
      <path d="M164 73L171 100Q130 96 99 116V95Q128 70 164 73Z" fill="#F8FEFF" stroke="url(#vl52-book-gradient)" strokeWidth="3.8" strokeLinejoin="round" />
      <path d="M22 110Q64 104 97 131Q131 104 173 110" stroke="#003D91" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M97 95V129" stroke="#00ACEE" strokeWidth="3.3" strokeLinecap="round" />
      <path d="M34 87Q63 86 87 104M160 87Q133 86 107 104" stroke="#64C3EE" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      {/* Quỹ đạo nguyên tử: ba ellipse tạo thành biểu tượng vật lý */}
      <g stroke="url(#vl52-atom-gradient)" strokeWidth="3.3">
        <ellipse cx="95" cy="52" rx="47" ry="16.5" transform="rotate(-32 95 52)" />
        <ellipse cx="95" cy="52" rx="47" ry="16.5" transform="rotate(32 95 52)" />
        <ellipse cx="95" cy="52" rx="47" ry="16.5" transform="rotate(90 95 52)" />
      </g>
      <circle cx="95" cy="52" r="9.3" fill="url(#vl52-electron-gradient)" stroke="#D0FFFF" strokeWidth="1.2" />
      <circle cx="56" cy="52" r="4.9" fill="#0059B6" />
      <circle cx="122" cy="16" r="4.6" fill="#12AFFF" />
      <circle cx="119" cy="84" r="4.3" fill="#0141A3" />
      {/* Bánh răng máy móc tượng trưng cho công nghệ */}
      <g transform="translate(132 83)">
        <path d="M-4-20H4L6-15L11-13L16-15L21-8L17-4L17 3L21 7L16 14L11 12L6 14L4 19H-4L-6 14L-11 12L-16 14L-21 7L-17 3L-17-4L-21-8L-16-15L-11-13L-6-15Z" fill="#095FB7" stroke="#E2FFFF" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="0" cy="-1" r="8" fill="#E0F9FF" />
      </g>
    </svg>
  );
}

/**
 * Component hiển thị trong lúc ứng dụng kiểm tra phiên Firebase.
 * `message` vẫn do ProtectedRoute / AuthStore truyền xuống.
 */
export function LoadingScreen({ message = "Đang tải phòng thí nghiệm..." }: LoadingScreenProps) {
  const [slow,setSlow]=useState(false);
  useEffect(()=>{const timer=window.setTimeout(()=>setSlow(true),10000);return()=>window.clearTimeout(timer);},[]);
  return (
    <main className="vl52-loading" role="status" aria-live="polite" aria-busy="true">
      <style>{styleSheet}</style>

      {/* Quỹ đạo nền trang trí, không can thiệp tương tác chuột hoặc phím. */}
      <svg className="vl52-loading__science" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g fill="none" stroke="#FFFFFF" opacity=".72">
          <circle cx="590" cy="336" r="242" strokeWidth="2" strokeDasharray="700 7 1000" />
          <circle cx="590" cy="336" r="312" strokeWidth="1.4" opacity=".65" />
          <circle cx="590" cy="336" r="405" strokeWidth="1" opacity=".4" />
          <path d="M0 552Q345 209 653 253T1200 303" strokeWidth="1.3" opacity=".5" />
        </g>
        <g fill="#E6FBFF" stroke="#91DCFF" strokeWidth="2">
          <circle cx="348" cy="336" r="12" fillOpacity=".42" />
          <circle cx="866" cy="120" r="9" fillOpacity=".5" />
          <circle cx="914" cy="494" r="18" fillOpacity=".25" />
          <circle cx="186" cy="603" r="7" fillOpacity=".55" />
        </g>
        <g fill="#FFFFFF">
          <circle cx="248" cy="207" r="5" opacity=".9" />
          <circle cx="768" cy="310" r="4" opacity=".7" />
          <circle cx="1030" cy="300" r="5" opacity=".8" />
          <circle cx="498" cy="76" r="3" opacity=".8" />
        </g>
      </svg>

      <section className="vl52-loading__content" aria-label="Đang khởi động phòng thí nghiệm">
        <LaboratoryMark />
        <h1 className="vl52-loading__title">LAB THỰC HÀNH</h1>
        <p className="vl52-loading__subtitle">BỘ MÔN VẬT LÝ CÔNG NGHỆ</p>
        <div
          className="vl52-loading__progress-track"
          role="progressbar"
          aria-label="Đang tải ứng dụng"
          aria-valuetext="Đang tải"
        >
          <span className="vl52-loading__progress-indicator" />
        </div>
        <p className="vl52-loading__message">{message}</p>
        {slow&&<div style={{marginTop:18,fontSize:13,lineHeight:1.7}}><p>Kết nối đang chậm. Kiểm tra mạng rồi thử tải lại trang.</p><button type="button" onClick={()=>window.location.reload()} style={{marginTop:8,padding:'9px 16px',border:'1px solid currentColor',borderRadius:9,background:'transparent',color:'inherit',cursor:'pointer'}}>Thử tải lại</button></div>}
      </section>

      <div className="vl52-loading__floor" aria-hidden="true" />
    </main>
  );
}

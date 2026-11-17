'use strict';
import {renderExperimentHub,HUB_TABS} from './ui/experiment-hub.js';
import {validateSavedEntries} from './lab-v11/measurement-core.js';
import {buildMeasurementWorkbook} from './lab-v11/lab-xlsx-export.js';
import {semiconductorReportMarkup,exportSemiconductorTable} from './semiconductor-studio.js';
import {TRANSISTOR_COURSES,transistorParts,renderTransistorStudio,exportTransistorCourse,readTransistorReportDraft,writeTransistorReportDraft} from './transistor-studio.js';
import {isTransistorLesson} from './lab-v11/transistor-lessons.js';
import {validateTransistorRecords} from './lab-v11/transistor-records.js';
let semiconductorState={},semiconductorDefect='NORMAL';
let transistorState={},transistorReports={};

/*
 * LABVIRT Studio: lộ trình và sổ đo cục bộ cho phòng Blender gốc.
 * Vào thẳng bàn thực hành; Phần 1 dùng runtime đo độc lập trong iframe.
 * Phần 2–4 dùng cùng phòng Blender và lưu số đo theo UID, không tự xác nhận điểm.
 */
const PARTS = Object.freeze([
  {
    id: 1,
    title: 'Đọc và đo kiểm tra linh kiện thụ động',
    short: 'Điện trở · Tụ điện · Cuộn cảm',
    table: 'Bảng 1.1',
    summary: 'Đọc mã màu/mã chữ, kiểm tra bằng đồng hồ vạn năng và đánh giá chênh lệch giữa giá trị lý thuyết với phép đo.',
    steps: [
      'Chọn và đọc mã màu của điện trở, xác định trị số danh định cùng dung sai.',
      'Chọn thang Ω, đo hai đầu điện trở và so sánh trị số thực tế.',
      'Đọc tụ hóa 100 µF và tụ gốm mã 104; đo bằng thang điện dung C.',
      'Đo điện trở thuần của cuộn cảm 10 mH; điền Bảng 1.1.'
    ],
    tools: ['DMM (Ω / C)', 'Điện trở', 'Tụ gốm 104', 'Tụ hóa 100 µF', 'Cuộn cảm 10 mH'],
    notes: 'Bộ thực hành gồm R1, R2, R3, tụ gốm 104, tụ hóa 100 µF và cuộn cảm 10 mH; mỗi linh kiện có ba tình huống SỐNG, CHẠM và ĐỨT.',
    safety: 'Không đo Ω/C khi mạch đang cấp nguồn; xả điện tụ lớn trước khi đo.'
  },
  {
    id: 2,
    title: 'Kiểm tra chất lượng Diode chỉnh lưu và Diode Zener',
    short: 'Đo thuận · Đo ngược · Chẩn đoán',
    table: 'Bảng 1.2',
    summary: 'Nhận biết cực Anode/Cathode và kiểm tra chất lượng các diode bằng phép đo sụt áp thuận và hiển thị chiều ngược.',
    steps: [
      'Chọn thang Diode trên DMM; nhận diện vạch Cathode.',
      'Đặt que đỏ vào Anode và que đen vào Cathode để đo chiều thuận.',
      'Đảo hai que để đo chiều ngược; quan sát giá trị hoặc O.L.',
      'Thực hiện với diode chỉnh lưu, diode tốc độ cao và Zener 5,1 V; ghi Bảng 1.2.'
    ],
    tools: ['DMM (Diode)', '1N4007', '1N4148', 'Diode Zener 5,1 V'],
    notes: 'Đo đủ ba diode ở trạng thái bình thường, chập và đứt; mỗi hàng cần cả chiều thuận và chiều ngược.',
    safety: 'Kiểm tra đúng chiều cực và đúng thang đo trước khi chạm que.'
  },
  {
    id: 3,
    title: 'Khảo sát mạch chỉnh lưu cầu có tụ lọc nguồn',
    short: 'Cầu 4 diode · Oscilloscope · Tụ lọc',
    table: 'Bảng 1.3',
    summary: 'Lắp cầu diode toàn chu kỳ, quan sát dạng sóng và so sánh điện áp DC cùng độ gợn sóng khi thay tụ lọc.',
    steps: [
      'Lắp cầu 4 diode 1N4007 theo Hình 1.1, mắc tải Rₗ = 1 kΩ.',
      'Kết nối nguồn thứ cấp 9 VAC, kiểm tra kết nối trước khi đóng điện.',
      'Đo lần lượt AC đầu vào và DC đầu ra bằng oscilloscope theo quy tắc mass chung.',
      'Khảo sát với C = 0 / 10 / 100 / 1000 µF; đo Vp,out, VDC, Vripple và ghi Bảng 1.3.'
    ],
    tools: ['4 diode 1N4007', 'Nguồn AC 9 V', 'Oscilloscope', 'DMM DCV', 'Tải 1 kΩ', 'Tụ 10/100/1000 µF'],
    notes: 'Tài liệu yêu cầu đo CH1 và CH2 lần lượt để tránh ngắn mạch qua dây mass chung. Cấu hình 5/12 VAC trong HTML là mở rộng.',
    safety: 'Không đồng thời kẹp mass oscilloscope ở hai điểm khác điện thế; ngắt nguồn trước khi thay tụ.'
  },
  {
    id: 4,
    title: 'Khảo sát mạch ổn áp dùng Diode Zener',
    short: 'Vin · Vout · Dòng tải · Ổn áp',
    table: 'Bảng 1.4',
    summary: 'Dựng mạch ổn áp Zener, thay đổi Vin và đo Vout để xác định vùng chưa ổn áp và vùng ổn áp.',
    steps: [
      'Lắp Zener 5,1 V phân cực ngược, điện trở Rs = 220 Ω nối tiếp và tải Rₗ = 1 kΩ.',
      'Nối nguồn DC thay đổi được, kiểm tra cực tính và cấp nguồn.',
      'Đặt Vin theo 11 mốc: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12 V.',
      'Đo Vout, tính dòng tải Iₗ và sụt áp trên Rs, ghi Bảng 1.4.'
    ],
    tools: ['Nguồn DC 0–12 V', 'Zener 5,1 V', 'Rs 220 Ω', 'Tải 1 kΩ', 'DMM DCV'],
    notes: 'Các giá trị Zener 3,3/5,6 V và các tải khác trong HTML thuộc nhóm luyện tập mở rộng, không thay thế cấu hình chuẩn PDF.',
    safety: 'Bắt buộc có điện trở hạn dòng và kiểm tra đúng chiều Zener.'
  }
]);

let activeSessionId=(()=>{
  try{
    let id=sessionStorage.getItem('labvirt-standalone-session-v2');
    if(!id||!/^[a-zA-Z0-9_-]{3,80}$/.test(id)){
      id='session-'+(crypto.randomUUID?.()||Date.now().toString(36));
      sessionStorage.setItem('labvirt-standalone-session-v2',id);
    }
    return id;
  }catch{return 'local-session';}
})();
let REPORT_STORAGE_KEY = 'labvirt-working-report-v1:'+activeSessionId;
const COMPONENT_LABELS = Object.freeze({
  R1:{name:'Điện trở R1',nominal:'1 kΩ',tolerance:'±5%'},
  R2:{name:'Điện trở R2',nominal:'10 kΩ',tolerance:'±5%'},
  R3:{name:'Điện trở R3',nominal:'220 Ω',tolerance:'±5%'},
  C1:{name:'Tụ gốm C1',nominal:'100 nF',tolerance:'±10%'},
  C2:{name:'Tụ hóa C2',nominal:'100 µF',tolerance:'±20%'},
  L:{name:'Cuộn cảm L',nominal:'10 mH',tolerance:'±10%'}
});
function cleanRecords(value) {
  if(!Array.isArray(value))return [];
  return validateSavedEntries(value.map(row=>row?.record||row)).map(record=>({...record,record,display:record.lcd}));
}
let localRecords=[];
try{localRecords=cleanRecords(JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY)||localStorage.getItem('labvirt-passive-v6:'+activeSessionId)||'[]'));}catch{}
let sessionDirty=false;
// Đồng bộ tiến độ trong cùng nguồn dữ liệu. Không truy cập/xóa Firestore.
const BASE_PROGRESS_KEY = 'labvirt-portal-progress-v1';
let academyUid = window.parent === window ? null : 'awaiting-host';
let academyIdentity={};
let cloudState={enabled:false,confirmed:null,error:'',steps:null,totalSteps:null};
function storageLabel(){
  if(!cloudState.enabled)return 'Chỉ lưu trên thiết bị · chưa bật đồng bộ Firebase';
  if(cloudState.error)return 'Chưa đồng bộ · kiểm tra kết nối hoặc quyền truy cập';
  if(!Array.isArray(cloudState.confirmed))return 'Đang tải dữ liệu Firebase…';
  if(localRecords.some(row=>!cloudState.confirmed.includes(row.key)))return 'Chưa đồng bộ · có phép đo đang chờ server';
  return localRecords.length?'Đã lưu Firebase · server xác nhận':'Đã tải Firebase · chưa có phép đo';
}
function storageMarkup(){return '<span class="cloud-label">☁ '+htmlSafe(storageLabel())+'</span>';}
function ringMarkup(){const count=localRecords.length;return `<div class="progress-ring" style="--progress:${count/18*360}deg"><div><strong>${count}/18</strong><small>trường hợp đo</small></div></div>`;}
function instrumentMarkup(){return '<div class="physics-instruments" aria-hidden="true"><svg viewBox="0 0 260 170"><rect x="5" y="40" width="145" height="105" rx="12" fill="#284d62"/><rect x="15" y="50" width="125" height="72" rx="4" fill="#031c2d" stroke="#14d4e4"/><path d="M25 86 Q33 42 42 85 T60 85 T78 85 T96 85 T114 85 T132 85" fill="none" stroke="#22e5df" stroke-width="4"/><g transform="rotate(-10 200 85)"><rect x="165" y="12" width="74" height="144" rx="16" fill="#f4a60b" stroke="#ffd34a" stroke-width="5"/><rect x="177" y="27" width="50" height="34" rx="3" fill="#a5d9ce"/><text x="202" y="49" text-anchor="middle" fill="#16424a" font-size="20" font-family="monospace">DMM</text><circle cx="202" cy="91" r="21" fill="#40546b"/><circle cx="202" cy="91" r="12" fill="#13293c"/></g></svg></div>';}

function progressKey(){return academyUid === null ? BASE_PROGRESS_KEY : BASE_PROGRESS_KEY + ':' + academyUid;}
const VIEW_SET = new Set(['roadmap','catalog','mine','report','workbench']);
const params = new URLSearchParams(location.search);
let hubSearch='',hubTab='steps';
const state = {
  view: VIEW_SET.has(params.get('view')) ? params.get('view') : 'roadmap',
  course:[1,2,3].includes(Number(params.get('course')))?Number(params.get('course')):1,
  part: [1,2,3,4].includes(Number(params.get('part'))) ? Number(params.get('part')) : 1
};
if(state.course===2&&state.part>3)state.part=1;
function readPortalProgress(){
  try {
    const parsed = JSON.parse(localStorage.getItem(progressKey()) || '{}');
    if(!parsed || typeof parsed!=='object') return {};
    return parsed;
  } catch { return {}; }
}
function writePortalProgress(patch){
  const old = readPortalProgress();
  const data = {...old,...patch,version:1,updatedAt:new Date().toISOString()};
  try { localStorage.setItem(progressKey(),JSON.stringify(data)); } catch {}
  if(window.parent!==window) window.parent.postMessage({type:'labvirt:portal-progress',progress:{part:data.part,records:data.records||0,updatedAt:data.updatedAt}},location.origin);
  window.dispatchEvent(new CustomEvent('labvirt:portal-progress',{detail:data}));
}
const lastProgress = readPortalProgress();
if(window.parent!==window) localRecords=[];
else if(!localRecords.length && Array.isArray(lastProgress.savedRecords)) localRecords=cleanRecords(lastProgress.savedRecords);
function savePortalRecords(rows){
  const clean = cleanRecords(rows);
  const previous = readPortalProgress();
  // Không xóa các kết quả cũ khi một phiên thử nghiệm mới bắt đầu trống.
  // Số liệu lưu ở đây là dữ liệu cục bộ, KHÔNG được giả nhận là bảng điểm Firestore.
  if(!clean.length && Array.isArray(previous.savedRecords) && previous.savedRecords.length)return;
  const union=new Map(cleanRecords(previous.savedRecords).concat(clean).map(row=>[row.component+':'+row.defect,row]));
  const savedRecords=cleanRecords([...union.values()]);
  writePortalProgress({part:state.part,records:savedRecords.length,savedRecords});
}
function setViewHistory(){
  const query = new URLSearchParams(location.search);
  query.set('view',state.view);query.set('part',String(state.part));
  if(state.course>1)query.set('course',String(state.course));else query.delete('course');
  history.replaceState({},'',location.pathname+'?'+query.toString());
}
if(params.get('embed')==='1')document.body.classList.add('embed-mode');

const mainContent = document.getElementById('mainContent');
const sideParts = document.getElementById('sidebarParts');

function htmlSafe(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function item(id) {const parts=state.course===1?PARTS:transistorParts(state.course);return parts.find(p => p.id === Number(id)) || parts[0];}
function currentReportState(){const key='B'+state.course;if(!transistorReports[key])transistorReports[key]={draft:readTransistorReportDraft(academyUid||activeSessionId,state.course),status:'Bản nháp trên thiết bị; chưa xác nhận Firebase.'};return transistorReports[key];}
function courseNavigation(){return `<nav class="btn-row course-navigation" aria-label="Chọn bài thực hành">${[1,2,3].map(course=>`<button type="button" class="btn ${course===state.course?'btn-primary':'btn-secondary'}" data-course="${course}" aria-pressed="${course===state.course}">Bài ${course} · ${htmlSafe(course===1?'Linh kiện và diode':TRANSISTOR_COURSES[course])}</button>`).join('')}</nav>`;}
function stepsMarkup(part) {
  return `<div class="task-list">${part.steps.map((step,index) => `<div class="task"><span class="task-num">${index+1}</span><span>${htmlSafe(step)}</span></div>`).join('')}</div>`;
}
function toolsMarkup(part){return `<div class="tool-row">${part.tools.map(t=>`<span class="tool-pill">${htmlSafe(t)}</span>`).join('')}</div>`;}

function renderSidePartList(){
  sideParts.innerHTML = (state.course===1?PARTS:transistorParts(state.course)).map(part => `
    <button class="side-part ${part.id===state.part?'on':''}" type="button" data-part="${part.id}" data-view="roadmap" aria-current="${part.id===state.part?'step':'false'}">
      <span class="side-part-index">0${part.id}</span><span class="side-part-text">${htmlSafe(part.title)}</span>
    </button>`).join('');
  for(const button of document.querySelectorAll('.nav-link')){
    button.classList.toggle('active',button.dataset.view===(state.view==='roadmap'?'catalog':state.view) || (state.view==='workbench' && button.dataset.view==='catalog'));
  }
}

function renderRoadmap(){
  return renderExperimentHub({course:state.course,parts:state.course===1?PARTS:transistorParts(state.course),selected:state.part,search:hubSearch,tab:hubTab,courseNavigation:courseNavigation(),art:componentArt});
}

function reportData(id){
  if(id===1) return {name:'Bảng 1.1 — Đọc và đo kiểm tra trị số linh kiện thụ động',head:['Linh kiện','Giá trị lý thuyết (mã màu/mã chữ)','Sai số cho phép (%)','Giá trị đo thực tế','Chênh lệch thực tế − lý thuyết','Đánh giá chất lượng'],rows:['Điện trở R1','Điện trở R2','Tụ C1 (gốm)','Tụ C2 (hóa)','Cuộn cảm L1'].map(s=>[s,'—','—','—','—','—'])};
  if(id===2) return {name:'Bảng 1.2 — Kiểm tra chất lượng Diode',head:['Mã linh kiện','Điện áp đo chiều thuận (V)','Kết quả đo chiều ngược','Trạng thái linh kiện'],rows:['Diode 1N4007','Diode 1N4148','Diode Zener 5,1 V'].map(s=>[s,'—','—','—'])};
  if(id===3) return {name:'Bảng 1.3 — Khảo sát mạch chỉnh lưu cầu (9 VAC, 50 Hz)',head:['Tham số đo','Không có tụ C=0','Có tụ C=10 µF','Có tụ C=100 µF','Có tụ C=1000 µF'],rows:['Vp,out (V)','VDC (V)','Vripple (V)','Dạng sóng ngõ ra (phác thảo)'].map(s=>[s,'—','—','—','—'])};
  return {name:'Bảng 1.4 — Đặc tính ổn áp Zener (5,1 V; Rs=220 Ω; RL=1 kΩ)',head:['Vin (V)','Vout trên tải (V)','Dòng qua tải IL (mA)','Sụt áp trên Rs (V)'],rows:[1,2,3,4,5,6,7,8,9,10,12].map(v=>[String(v),'—','—','—'])};
}
function renderReport(){
  if(state.part>1)return semiconductorReportMarkup(state.part,semiconductorState['B1_P'+state.part],semiconductorDefect);
  const table=reportData(state.part);
  const isPartOne=state.part===1;
  const headings=isPartOne?['Tên linh kiện','Trị số danh định','Dung sai cho phép','Thực tế đo được','Trạng thái linh kiện','Kết luận chất lượng']:table.head;
  const rows=isPartOne?localRecords.map(row=>{
    const c=COMPONENT_LABELS[row.component];
    return [c.name,c.nominal,row.tolerance||c.tolerance,row.display,{NORMAL:'SỐNG',SHORT:'CHẠM',OPEN:'ĐỨT'}[row.defect],row.conclusion];
  }):table.rows;
  return `<div class="page-kicker">LABVIRT / SỔ THỰC HÀNH ĐIỆN TỬ</div>
    <div class="report-head"><div><h1>Kết quả & Báo cáo</h1><p>${isPartOne?'Bảng 1.1 có '+localRecords.length+'/18 trường hợp đã ghi.':'Phần này chưa tích hợp mô phỏng; dưới đây là cấu trúc bảng chuẩn bị.'}</p></div><div class="btn-row"><button type="button" class="btn btn-secondary" data-view="roadmap">← Về lộ trình</button>${isPartOne?'<button type="button" class="btn btn-primary" data-export-host-xlsx>↓ Xuất Excel</button><button type="button" class="btn btn-secondary" data-export-host-csv>↓ Xuất CSV</button>':''}</div></div>
    <div class="tabs" role="tablist" aria-label="Chọn bảng">${[1,2,3,4].map(part=>`<button type="button" role="tab" data-report-part="${part}" class="tab ${state.part===part?'active':''}" aria-selected="${state.part===part}">Bảng 1.${part}</button>`).join('')}</div>
    <div class="report-columns"><section class="panel report-preview"><h3>${htmlSafe(table.name)}</h3><p>${isPartOne?'Chỉ các phép đo được ghi từ phòng thực hành xuất hiện ở đây. Kết quả mô phỏng cần giảng viên xác minh trước khi chấm điểm.':'Bảng mẫu chưa có số đo.'}</p>
      <div style="overflow:auto"><table class="report-table"><thead><tr>${headings.map(h=>`<th scope="col">${htmlSafe(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map((v,index)=>`<td>${index===0?`<strong>${htmlSafe(v)}</strong>`:htmlSafe(v)}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="6" class="empty-report">Chưa có số liệu. Mở phòng, thực hiện phép đo rồi bấm Ghi vào Bảng 1.1.</td></tr>'}</tbody></table></div>
    <p class="report-empty">${isPartOne?'Với cuộn cảm 10 mH, số đo Ω là điện trở thuần của dây quấn. Cần dùng thiết bị khác để đo điện cảm.':'Các phần còn lại sẽ được tích hợp riêng; không sinh số đo tự động.'}</p></section><aside class="report-aside"><article class="v9-card"><h2>Tiến độ Bảng 1.1</h2>${ringMarkup()}<p>Đã ghi: <strong>${localRecords.length}</strong> · Còn lại: ${18-localRecords.length}</p>${storageMarkup()}</article><article class="v9-card"><h2>Dụng cụ sử dụng</h2>${toolsMarkup(item(state.part))}<p>${state.part===1?'Phòng 3D đã có cho Phần 1.':'Chưa có mô phỏng phần này; bảng chuẩn bị chưa có số đo.'}</p></article></aside></div>`;
}
function exportHostCsv(){
  if(!localRecords.length){alert('Chưa có phép đo hợp lệ để xuất.');return;}
  const rows=[['Tên linh kiện','Trị số danh định','Dung sai cho phép','Thực tế đo được','Trạng thái linh kiện','Kết luận chất lượng'],...localRecords.map(row=>{
    const c=COMPONENT_LABELS[row.component];return [c.name,c.nominal,row.tolerance||c.tolerance,row.display,{NORMAL:'SỐNG',SHORT:'CHẠM',OPEN:'ĐỨT'}[row.defect],row.conclusion];
  })];
  const csv='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='LABVIRT_Bang_1_1.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportHostExcel(){
  if(!localRecords.length){alert('Chưa có phép đo hợp lệ để xuất Excel.');return;}
  const workbook=buildMeasurementWorkbook(localRecords.map(row=>row.record),{sessionId:activeSessionId,...academyIdentity});
  const url=URL.createObjectURL(workbook),link=document.createElement('a');
  link.href=url;link.download='LABVIRT_Bang_1_1.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}

function renderWorkbench(){
  const p=item(state.part);
  return `<div class="page-kicker">KHU THỰC HÀNH 0${p.id} / 04</div>
  <section class="workbench"><div class="workbench-top"><div><div class="detail-number">BÀI 1 · PHẦN ${p.id}</div><h1>${htmlSafe(p.title)}</h1></div><button type="button" class="btn btn-secondary" data-view="roadmap">← Về 4 phần</button></div>
    <div id="lab3d-root" class="workbench-zone" data-lab-part="${p.id}" aria-label="Khu vực bắt đầu bài thực hành toàn màn hình">
      <div class="start-lab"><div class="start-lab-icon">⛶</div><strong>Phòng thực hành toàn màn hình</strong><p>Nhấn nút để mở không gian thực hành. Sau cảnh bước vào phòng, khu 3D sẽ tự hiển thị.</p>
      <button type="button" class="btn btn-primary start-fullscreen" data-start-fullscreen="${p.id}">⛶ Toàn màn hình · Bắt đầu Phần 0${p.id}</button><button type="button" class="btn btn-secondary hidden" data-cancel-entry>Hủy mở phòng</button>
      <small>${p.id===1?'Phòng Blender gốc · 6 linh kiện · 18 tình huống · Bảng 1.1.':'Cùng phòng Blender · Tiếp xúc và dây mạch thực · '+p.table}</small></div>
    </div><p class="lab-status">Bấm Esc hoặc Quay lại lộ trình để rời phòng. Các số liệu đã ghi vẫn được giữ trên máy.</p>
    <div class="workbench-bottom"><strong>Những bước sinh viên sẽ thực hiện trong khu này</strong>${stepsMarkup(p)}<div class="btn-row"><button type="button" class="btn btn-primary" data-view="roadmap">Xem lộ trình 4 phần</button><button type="button" class="btn btn-secondary" data-view="report">Xem ${p.table}</button></div></div>
  </section>`;
}

function pageTop(kicker,title,desc){
  return `<header class="roadmap-header"><div class="page-kicker">${htmlSafe(kicker)}</div><h1 class="page-title">${htmlSafe(title)}</h1><p class="page-subtitle">${htmlSafe(desc)}</p></header>`;
}
function progressCount(){return cleanRecords(readPortalProgress().savedRecords).length;}

function componentArt(id){
  const body=id===1?'<g transform="rotate(-25 80 70)"><path d="M7 64h146" stroke="#a3c4e1" stroke-width="6"/><rect x="37" y="48" width="86" height="32" rx="11" fill="#eec188"/><path d="M52 49v30m17-30v30m20-30v30m18-30v30" stroke="#b36c36" stroke-width="7"/></g>':id===2?'<g transform="rotate(-30 80 65)"><path d="M11 65h137" stroke="#b2d3ea" stroke-width="5"/><rect x="48" y="49" width="63" height="32" rx="9" fill="#a54a29"/><path d="M98 49v32" stroke="#eee3c5" stroke-width="6"/></g>':id===3?'<path d="M64 24 25 65 64 105 103 65Z" fill="#123e61" stroke="#67d8f5" stroke-width="3"/><path d="m37 57 16-17m23 0 16 17M37 76l16 17m23 0 16-17" stroke="#e1ecfb" stroke-width="7"/><path d="M64 24v-9m0 90v20M103 65h25v-8m0 16v35M117 57h22M117 73h22" stroke="#36e6e2" stroke-width="3"/><text x="53" y="72" fill="#d0edfa" font-size="17">+</text>':'<g transform="rotate(-25 80 65)"><path d="M10 65h140" stroke="#b3dded" stroke-width="5"/><rect x="46" y="47" width="69" height="36" rx="12" fill="#b04d37"/><path d="M97 47v36" stroke="#e7ddce" stroke-width="7"/></g><path d="M44 107h27l-13-10v20l13-10h39m-31-12v24m0-24h-7m7 24h7" fill="none" stroke="#64e4fa" stroke-width="3"/>';
  return `<svg viewBox="0 0 160 165"><ellipse cx="80" cy="145" rx="68" ry="12" fill="#064c75" stroke="#05ccec"/><ellipse cx="80" cy="145" rx="49" ry="6" fill="#0874a3" opacity=".6"/>${body}</svg>`;
}
function renderMine(){
  const count=progressCount(),percent=Math.round(count/18*100),recent=[...localRecords].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
  return pageTop('LABVIRT / KHÔNG GIAN CÁ NHÂN','Thực hành của tôi','Tiếp tục bài học và xem những phép đo đã ghi. Dữ liệu gắn với tài khoản đang đăng nhập.')+
    `<section class="personal-columns"><div><article class="v9-card v9-current"><div class="personal-hero"><div><span class="v9-status ready">BÀI ĐANG HỌC</span><h2>Bài 1 — ${htmlSafe(PARTS[0].title)}</h2><p>Phần 1 / 4 · Bảng 1.1 · DMM và breadboard</p><div class="v9-progress-meta"><strong>${count}/18</strong><span>trường hợp đã ghi</span></div><div class="v9-track"><span style="width:${percent}%"></span></div><p>${cloudState.steps===null?'Đang chờ tiến độ các bước từ tài khoản':`${cloudState.steps}/${cloudState.totalSteps} bước đã hoàn thành`} · Tiến độ bước và số phép đo là hai chỉ số riêng.</p><button class="btn btn-primary" data-go-workbench="1">Tiếp tục trong phòng 3D →</button></div>${instrumentMarkup()}</div></article>
    <div class="personal-stats"><div><strong>${count}</strong>Phép đo đã ghi</div><div><strong>${18-count}</strong>Trường hợp còn lại</div><div><strong>04</strong>Phần trong Bài 1</div></div>
    <article class="v9-card"><h2>Kết quả gần đây</h2>${recent.length?recent.slice(0,3).map(r=>`<div class="personal-result"><strong>${htmlSafe(r.componentName)}</strong><span>${htmlSafe(r.display)}</span><small>${htmlSafe(r.conclusion)}</small></div>`).join(''):'<p>Chưa có phép đo. Mở phòng 3D, thực hiện phép đo hợp lệ rồi ghi vào Bảng 1.1.</p>'}</article></div>
    <div><article class="v9-card"><h2>Dòng hoạt động thực hành</h2>${recent.length?recent.slice(0,5).map(r=>`<div class="personal-activity"><span>✓</span><div><strong>Đã ghi ${htmlSafe(r.key)}</strong><small>${htmlSafe(new Date(r.recordedAt).toLocaleString('vi-VN'))}</small></div><b>${htmlSafe(r.display)}</b></div>`).join(''):'<p>Chưa có bản ghi hoạt động. Không tự tạo lịch sử thực hành.</p>'}</article><article class="v9-card personal-storage"><h2>Trạng thái lưu trữ</h2>${storageMarkup()}<p>Chỉ thông báo lưu Firebase khi server xác nhận. Bản dự phòng theo UID được giữ trên thiết bị khi mất mạng.</p><button class="btn btn-secondary" data-view="report">Xem Kết quả & Báo cáo →</button></article></div></section>`;
}
function render(){
  renderSidePartList();
  if(academyUid==='awaiting-host'){mainContent.innerHTML='<p role="status">Đang tải tiến độ tài khoản…</p>';return;}
  if(state.view==='roadmap'||state.view==='catalog'){mainContent.innerHTML=renderRoadmap();return;}
  if(state.course>1){mainContent.innerHTML=courseNavigation()+'<div class="transistor-studio">'+renderTransistorStudio(state.view,state.course,state.part,transistorState,currentReportState())+'</div>';return;}
  if(state.view==='mine') mainContent.innerHTML=renderMine();
  else if(state.view==='report') mainContent.innerHTML=renderReport();
  else mainContent.innerHTML=renderWorkbench();
  mainContent.insertAdjacentHTML('afterbegin',courseNavigation());
}
function goto(view){
  if(!VIEW_SET.has(view))return;
  state.view=view;setViewHistory();render();window.scrollTo(0,0);
  if(window.parent!==window && ['roadmap','catalog','mine','report'].includes(view)){
    window.parent.postMessage({type:'labvirt:navigate',view},location.origin);
  }
}
function setPart(part){state.part=item(part).id;setViewHistory();render();}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-cancel-entry')){exitFullscreenLab();return;}
  if(button.hasAttribute('data-hub-tab')){if(HUB_TABS.includes(button.dataset.hubTab)){hubTab=button.dataset.hubTab;render();document.getElementById('hub-tab-'+hubTab)?.focus();}return;}
  if(button.hasAttribute('data-course')){if(isLabActive)return;const course=Number(button.dataset.course);if(![1,2,3].includes(course))return;state.course=course;state.part=1;writePortalProgress({course,part:1});setViewHistory();render();return;}
  if(button.hasAttribute('data-export-transistor')){try{exportTransistorCourse(state.course,transistorState,button.dataset.exportTransistor,academyIdentity,currentReportState().draft);}catch(error){alert(error.message);}return;}
  if(button.hasAttribute('data-save-transistor-report')){const report=currentReportState();report.pendingFields=structuredClone(report.draft.fields);writeTransistorReportDraft(academyUid||activeSessionId,state.course,report.draft);if(window.parent===window||!academyUid){report.status='Đăng nhập qua website chính để lưu Firebase; bản nháp trên máy được giữ.';render();return;}window.parent.postMessage({type:'labvirt:transistor-save-report',uid:academyUid,report:report.draft},location.origin);report.status='Đang chờ server xác nhận báo cáo.';render();return;}
  if(button.hasAttribute('data-load-transistor-report')){const report=currentReportState();if(!report.server){report.status='Chưa có bản server đã xác nhận để khôi phục.';}else{report.previousDraft=report.draft;report.draft={...structuredClone(report.server),dirty:false};report.status='Đã khôi phục bản server, phiên bản '+report.server.revision;writeTransistorReportDraft(academyUid||activeSessionId,state.course,report.draft);}render();return;}
  if(button.hasAttribute('data-semi-defect')){semiconductorDefect=button.dataset.semiDefect;render();return;}
  if(button.hasAttribute('data-export-semi')){try{exportSemiconductorTable(state.part,semiconductorState['B1_P'+state.part],semiconductorDefect,button.dataset.exportSemi,academyIdentity);}catch(error){alert(error.message);}return;}
  if(button.hasAttribute('data-export-host-csv')){exportHostCsv();return;}
  if(button.hasAttribute('data-export-host-xlsx')){exportHostExcel();return;}
  if(button.hasAttribute('data-start-fullscreen')){startFullscreenLab(Number(button.dataset.startFullscreen));return;}
  if(button.hasAttribute('data-report-part')){state.part=Number(button.dataset.reportPart);goto('report');return;}
  if(button.hasAttribute('data-go-workbench')){if(isLabActive)return;state.part=Number(button.dataset.goWorkbench);goto('workbench');startFullscreenLab(state.part);return;}
  if(button.hasAttribute('data-part')){setPart(button.dataset.part);if(button.dataset.view)goto(button.dataset.view);return;}
  if(button.hasAttribute('data-view'))goto(button.dataset.view);
});
document.addEventListener('input',event=>{if(event.target.hasAttribute?.('data-transistor-report-field')){const report=currentReportState(),field=event.target.dataset.transistorReportField,value=event.target.value.slice(0,4000);if(/^answer[0-2]$/.test(field))report.draft.fields.answers[Number(field.slice(-1))]=value;else if(['group','objectives','theory','discussion'].includes(field))report.draft.fields[field]=value;report.draft.dirty=true;report.status='Bản nháp chưa được server xác nhận.';writeTransistorReportDraft(academyUid||activeSessionId,state.course,report.draft);return;}if(event.target.id==='hubSearch'){hubSearch=event.target.value;const start=event.target.selectionStart;render();const input=document.getElementById('hubSearch');input?.focus();input?.setSelectionRange(start,start);}});
document.addEventListener('keydown',event=>{
  const tab=event.target.closest?.('[data-hub-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const index=HUB_TABS.indexOf(hubTab);
  hubTab=HUB_TABS[event.key==='Home'?0:event.key==='End'?HUB_TABS.length-1:(index+(event.key==='ArrowRight'?1:-1)+HUB_TABS.length)%HUB_TABS.length];
  render();document.getElementById('hub-tab-'+hubTab)?.focus();
});
setViewHistory();
render();


// Tải phòng ở nền; chỉ hiện bàn thực hành khi WebGL và dữ liệu tài khoản sẵn sàng.
const fullscreenSurface=document.getElementById('labFullscreenSurface');
const runtimePhase=document.getElementById('runtimePhase');
const runtimeFrame=document.getElementById('labRuntime');
const pendingPhase=document.getElementById('pendingPhase');
const runtimeLoading=document.getElementById('runtimeLoading');
const runtimeLoadingTitle=document.getElementById('runtimeLoadingTitle');
const runtimeLoadingDetail=document.getElementById('runtimeLoadingDetail');
const runtimeErrorDetails=document.getElementById('runtimeErrorDetails');
const retryRuntime=document.getElementById('retryRuntime');
let currentLabPart=1;
let currentLabCourse=1;
const currentLessonId=()=>`B${currentLabCourse}_P${currentLabPart}`;
const runtimeSupported=()=>currentLabCourse===1&&[1,2,3,4].includes(currentLabPart)||isTransistorLesson(currentLessonId());
let isLabActive=false;
let closingLab=false;
let runtimeReady=false;
let runtimeWatchdog=null;
let runtimeAttempt=0;
let runtimeStartedAt=0;
let runtimeLastProgressAt=0;
let runtimeRestoreStartedAt=0;
let runtimeRevealed=false;
let runtimeStaged=false;
let runtimeBootRequested=false;
function setLabEntryPending(pending,label='Đang mở phòng 3D…'){
  for(const button of document.querySelectorAll('[data-start-fullscreen]')){
    if(!button.dataset.entryLabel)button.dataset.entryLabel=button.textContent;
    button.disabled=pending;
    button.setAttribute('aria-busy',String(pending));
    button.textContent=pending?label:button.dataset.entryLabel;
  }
  for(const button of document.querySelectorAll('[data-cancel-entry]'))button.classList.toggle('hidden',!pending);
}
function bootReadyRuntime(){
  if(!isLabActive||!runtimeStaged||runtimeBootRequested)return;
  runtimeBootRequested=true;
  runtimeStartedAt=Date.now();
  runtimeLastProgressAt=runtimeStartedAt;
  // Prepare child focus; it is applied again after the account restore reveals
  // the iframe, because CSS visibility:hidden may ignore this first request.
  runtimeFrame.focus({preventScroll:true});
  runtimeFrame.contentWindow?.focus();
  runtimeFrame.contentWindow?.postMessage({type:'labvirt:boot-runtime',attempt:runtimeAttempt},location.origin);
}
function beginReadyRuntime(){
  if(!isLabActive||!runtimeReady||runtimeRevealed||runtimeFrame.classList.contains('runtime-waiting'))return;
  runtimeRevealed=true;
  clearRuntimeWatchdog();
  runtimePhase.classList.remove('hidden');
  runtimePhase.style.visibility='visible';
  fullscreenSurface.style.visibility='visible';
  setLabEntryPending(false);
  runtimeFrame.focus({preventScroll:true});
  runtimeFrame.contentWindow?.focus();
  fullscreenSurface.classList.add('runtime-cinematic');
  runtimeFrame.contentWindow?.postMessage({type:'labvirt:start-cinematic',attempt:runtimeAttempt},location.origin);
}
function clearRuntimeWatchdog(){if(runtimeWatchdog!==null){clearTimeout(runtimeWatchdog);runtimeWatchdog=null;}}
function showRuntimeError(message){
  clearRuntimeWatchdog();
  fullscreenSurface.classList.remove('runtime-cinematic');
  runtimePhase.classList.remove('hidden');
  runtimePhase.style.visibility='visible';
  fullscreenSurface.style.visibility='visible';
  setLabEntryPending(false);
  runtimeFrame.classList.add('runtime-waiting');
  // Only a genuine loading error uses this recovery panel.
  runtimeLoading.classList.remove('hidden');
  runtimeLoadingTitle.textContent='Không tải được phòng thí nghiệm 3D';
  runtimeLoadingDetail.textContent='Hãy kiểm tra kết nối hoặc thử nạp lại.';
  retryRuntime.classList.remove('hidden');
  runtimeErrorDetails.classList.remove('hidden');
  runtimeErrorDetails.textContent=String(message||'Không có thông tin chi tiết từ trình dựng cảnh.');
}
function loadRuntimeFrame(){
  runtimeReady=false;
  runtimeRevealed=false;
  runtimeStaged=false;
  runtimeBootRequested=false;
  runtimeAttempt++;
  runtimeStartedAt=Date.now();
  runtimeLastProgressAt=runtimeStartedAt;
  runtimeRestoreStartedAt=0;
  runtimeFrame.classList.remove('hidden');
  runtimeFrame.classList.add('runtime-waiting');
  runtimeLoading.classList.add('hidden');
  const attempt=runtimeAttempt;
  clearRuntimeWatchdog();
  runtimeFrame.src='./lab-v11/index.html?cinematic=1&deferCinematic=1&deferBoot=1&build=labvirt-blender-v7&sessionId='+encodeURIComponent(activeSessionId)+'&attempt='+attempt+(currentLabCourse>1||currentLabPart>1?'&lessonId='+currentLessonId():'');
  // Blender có thể cần nhiều phút. Miễn tiến độ còn cập nhật, không báo lỗi giả sau 60 giây.
  function checkWatchdog(){
    if(!isLabActive||runtimeRevealed||runtimeAttempt!==attempt)return;
    const now=Date.now();
    if(runtimeReady&&runtimeRestoreStartedAt&&now-runtimeRestoreStartedAt>12000){
      showRuntimeError('Phòng 3D đã tải xong nhưng chưa khôi phục được dữ liệu của tài khoản. Hãy thử nạp lại phòng; bản đo hiện có được giữ nguyên.');
    }else if(now-runtimeStartedAt>20*60*1000){
      showRuntimeError('Blender/WebGL chưa tải xong trong 20 phút. Kiểm tra blender-export.log hoặc dùng nút Thử nạp lại.');
    }else if(now-runtimeLastProgressAt>90000){
      showRuntimeError('Không nhận được tiến độ tải phòng 3D hơn 90 giây. Có thể WebGL bị treo hoặc iframe lỗi; kiểm tra F12 → Console.');
    }else runtimeWatchdog=setTimeout(checkWatchdog,10000);
  }
  runtimeWatchdog=setTimeout(checkWatchdog,10000);
}
function prepareRuntime(){
  runtimePhase.classList.remove('hidden');
  if(runtimeSupported()){
    pendingPhase.classList.add('hidden');
    runtimePhase.style.visibility='hidden';
    if(!runtimeFrame.getAttribute('src'))loadRuntimeFrame();
    bootReadyRuntime();
    beginReadyRuntime();
  }else{
    fullscreenSurface.style.visibility='visible';
    setLabEntryPending(false);
    clearRuntimeWatchdog();
    runtimeFrame.classList.add('hidden');
    runtimeLoading.classList.add('hidden');
    pendingPhase.classList.remove('hidden');
    const p=item(currentLabPart);
    pendingPhase.replaceChildren();
    const title=document.createElement('h2'); title.textContent='Bài 1 · Phần '+p.id;
    const desc=document.createElement('p');desc.textContent=p.title+' — Phần này hiện mới có giao diện và bảng số liệu. Chưa có mô hình 3D để thực hành.';
    pendingPhase.append(title,desc);
  }
}
function startFullscreenLab(part){
  if(isLabActive)return;
  writePortalProgress({part:item(part).id,lastOpenedAt:new Date().toISOString()});
  currentLabPart=item(part).id;
  currentLabCourse=state.course;
  sessionDirty=false;
  closingLab=false;
  isLabActive=true;
  if(window.parent!==window)window.parent.postMessage({type:'labvirt:lab-entered'},location.origin);
  runtimeRevealed=false;
  setLabEntryPending(true);
  document.body.classList.add('lab-is-open');
  fullscreenSurface.classList.remove('hidden');
  fullscreenSurface.classList.remove('runtime-cinematic');
  fullscreenSurface.style.visibility='hidden';
  runtimePhase.classList.add('hidden');
  runtimeFrame.removeAttribute('src');
  runtimeFrame.classList.add('runtime-waiting');
  runtimeLoading.classList.add('hidden');
  clearRuntimeWatchdog();
  prepareRuntime();
  // Phải yêu cầu fullscreen ngay trong sự kiện click để trình duyệt cấp quyền.
  // Keep the existing page visible while the room renders in the background.
  if(document.documentElement.requestFullscreen){
    document.documentElement.requestFullscreen({navigationUI:'hide'}).catch(()=>{
      // Trình duyệt không cấp quyền: lớp phủ vẫn chiếm toàn viewport,
      // nhưng không giả vờ rằng browser fullscreen đã bật.
      fullscreenSurface.classList.add('fallback-viewport');
    });
  }else fullscreenSurface.classList.add('fallback-viewport');
  if(window.parent!==window)window.parent.postMessage({type:'labvirt:lab-entering'},location.origin);
}
function exitFullscreenLab(){
  if(!isLabActive||closingLab)return;
  if(sessionDirty&&!confirm('Có thao tác đo chưa ghi. Rời phòng và giữ những số liệu đã lưu?'))return;
  closingLab=true; isLabActive=false;
  setLabEntryPending(false);
  if(window.parent!==window)window.parent.postMessage({type:'labvirt:lab-exited'},location.origin);
  clearRuntimeWatchdog();runtimeLoading.classList.add('hidden');
  runtimeFrame.src='about:blank';
  fullscreenSurface.classList.add('hidden');
  fullscreenSurface.classList.remove('fallback-viewport');
  document.body.classList.remove('lab-is-open');
  if(document.fullscreenElement===document.documentElement){
    document.exitFullscreen().catch(()=>{});
  }
  closingLab=false;
  sessionDirty=false;
  goto('roadmap');
  mainContent.focus({preventScroll:true});
}
// Chỉ mở phòng sau khi WebGL đã render và dữ liệu tài khoản được khôi phục.
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==runtimeFrame.contentWindow || !isLabActive)return;
  const data=event.data||{};
  if(Number(data.attempt)!==runtimeAttempt)return;
  if(data.type==='labvirt:runtime-staged'){runtimeStaged=true;runtimeLastProgressAt=Date.now();bootReadyRuntime();return;}
  if(data.type==='labvirt:session-state'){sessionDirty=data.dirty===true;return;}
  if(data.type==='labvirt:semiconductor-report'&&data.lessonId==='B1_P'+currentLabPart&&currentLabPart>1){semiconductorState[data.lessonId]={...semiconductorState[data.lessonId],records:data.records,status:semiconductorState[data.lessonId]?.status||'Bản cục bộ, chưa xác nhận Firebase.'};if(window.parent!==window&&academyUid)window.parent.postMessage({type:'labvirt:semiconductor-records',uid:academyUid,lessonId:data.lessonId,records:data.records},location.origin);return;}
  if(data.type==='labvirt:transistor-report'&&isTransistorLesson(data.lessonId)&&data.lessonId===currentLessonId()){const records=validateTransistorRecords(data.records,data.lessonId);transistorState[data.lessonId]={...transistorState[data.lessonId],records,status:transistorState[data.lessonId]?.status||'Bản cục bộ; chưa xác nhận Firebase.'};if(window.parent!==window&&academyUid)window.parent.postMessage({type:'labvirt:transistor-records',uid:academyUid,lessonId:data.lessonId,records},location.origin);return;}
  if(data.type==='labvirt:report'){
    localRecords=cleanRecords(data.entries);
    try{localStorage.setItem(REPORT_STORAGE_KEY,JSON.stringify(localRecords));}catch{}
    savePortalRecords(localRecords);
    return;
  }
  if(data.type==='labvirt:exit'){exitFullscreenLab();return;}
  if(data.type==='labvirt:runtime-progress' && !runtimeReady){
    runtimeLastProgressAt=Date.now();
    runtimeLoadingDetail.textContent=String(data.message||'Đang tải mô hình…').slice(0,220);
    const percent=String(data.message||'').match(/\d+%/);setLabEntryPending(true,percent?'Đang tải phòng 3D · '+percent[0]:'Đang chuẩn bị cảnh 3D…');
  }
  if(data.type==='labvirt:scene-ready'){
    runtimeReady=true;runtimeRestoreStartedAt=Date.now();
    if(window.parent!==window){
      setLabEntryPending(true,'Đang khôi phục bản đo trên thiết bị…');
      runtimeLoadingDetail.textContent='Đang khôi phục kết quả của tài khoản trước khi mở phòng…';
      window.parent.postMessage({type:'labvirt:runtime-ready'},location.origin);
    }else{
      runtimeFrame.classList.remove('runtime-waiting');runtimeLoading.classList.add('hidden');beginReadyRuntime();
    }
  }
  if(data.type==='labvirt:scene-error'){
    showRuntimeError(data.message);
  }
  if(data.type==='labvirt:cinematic-finished')fullscreenSurface.classList.remove('runtime-cinematic');
});
runtimeFrame.addEventListener('error',()=>{if(isLabActive&&!runtimeReady)showRuntimeError('Không tải được iframe phòng 3D. Kiểm tra máy chủ và đường dẫn lab-v11/index.html.');});
retryRuntime.addEventListener('click',()=>{
  fullscreenSurface.style.visibility='hidden';
  setLabEntryPending(true);
  runtimeFrame.removeAttribute('src');
  prepareRuntime();
});
document.getElementById('exitRuntimeLoading').addEventListener('click',exitFullscreenLab);

document.getElementById('exitLabRuntime').addEventListener('click',exitFullscreenLab);
document.addEventListener('fullscreenchange',()=>{
  if(isLabActive && !document.fullscreenElement && !fullscreenSurface.classList.contains('fallback-viewport'))exitFullscreenLab();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&isLabActive&&(!document.fullscreenElement||fullscreenSurface.classList.contains('fallback-viewport')))exitFullscreenLab();
});
window.addEventListener('beforeunload',event=>{
  if(isLabActive&&sessionDirty){event.preventDefault();event.returnValue='';}
});


// Trạng thái sẵn sàng chỉ thuộc vòng đời phòng 3D đang mở, không poll trạng thái xuất Blender ở các trang học.
// Cho phép website Academy chứa Studio bằng iframe cùng origin; không cho lệnh AI thay đổi dữ liệu đo.
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==window.parent || !event.data || window.parent===window)return;
  const data=event.data;
  if(data.type==='academy:runtime-local-ready'&&data.uid===academyUid&&Number(data.attempt)===runtimeAttempt&&runtimeReady&&isLabActive&&data.lessonId===currentLessonId()){runtimeFrame.classList.remove('runtime-waiting');runtimeLoading.classList.add('hidden');beginReadyRuntime();return;}
  if(data.type==='academy:runtime-restore-error'&&data.uid===academyUid&&Number(data.attempt)===runtimeAttempt&&isLabActive){showRuntimeError(data.message);return;}
  if(data.type==='academy:transistor-state'&&data.uid===academyUid&&isTransistorLesson(data.lessonId)&&Array.isArray(data.records)){const value={records:validateTransistorRecords(data.records,data.lessonId),confirmed:Array.isArray(data.confirmed)?data.confirmed:[],enabled:data.enabled===true,status:String(data.status||'')};if(JSON.stringify(value)!==JSON.stringify(transistorState[data.lessonId])){transistorState[data.lessonId]=value;if(state.course>1&&!isLabActive)render();}return;}
  if(data.type==='academy:transistor-report-state'&&data.uid===academyUid&&['B2','B3'].includes(data.courseId)){const course=Number(data.courseId.slice(1)),key=data.courseId,report=transistorReports[key]||{draft:readTransistorReportDraft(academyUid,course)};report.status=String(data.status||'');if(data.report&&data.confirmed===true){report.server=data.report;if(!report.draft.dirty||JSON.stringify(report.pendingFields)===JSON.stringify(data.report.fields)){report.draft={...structuredClone(data.report),dirty:false};report.pendingFields=null;writeTransistorReportDraft(academyUid,course,report.draft);}else if(report.draft.revision!==data.report.revision)report.status+=' Bản nháp đang dùng phiên bản cũ; cần đối chiếu bản server trước khi lưu.';}transistorReports[key]=report;if(state.course===course&&state.view==='report'&&!isLabActive)render();return;}
  if(data.type==='academy:semiconductor-state'&&data.uid===academyUid&&/^B1_P[234]$/.test(data.lessonId)&&Array.isArray(data.records)){const value={records:data.records,confirmed:data.confirmed,status:String(data.status||'')};if(JSON.stringify(value)!==JSON.stringify(semiconductorState[data.lessonId])){semiconductorState[data.lessonId]=value;if(state.view==='report'&&!isLabActive)render();}return;}
  if(data.type==='academy:sync-state'){cloudState={enabled:data.enabled===true,confirmed:Array.isArray(data.confirmed)?data.confirmed.filter(key=>typeof key==='string'):null,error:typeof data.error==='string'?data.error:'',steps:Number.isInteger(data.steps)?data.steps:null,totalSteps:Number.isInteger(data.totalSteps)?data.totalSteps:null};if(state.view!=='workbench')render();return;}
  if(data.type==='academy:session' && typeof data.uid === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(data.uid)){
    academyIdentity={fullName:String(data.identity?.fullName||'').slice(0,100),studentCode:String(data.identity?.studentCode||'').slice(0,40),className:String(data.identity?.className||'').slice(0,80)};
    if(academyUid!==data.uid){
      academyUid=data.uid;
      semiconductorState={};transistorState={};transistorReports={};window.parent.postMessage({type:'labvirt:semiconductor-request'},location.origin);window.parent.postMessage({type:'labvirt:transistor-request'},location.origin);
      // Tách session ID của runtime theo UID để tránh dùng chung phiên đo khi đổi tài khoản.
      const scopedSessionKey='labvirt-active-session-v1:'+academyUid;
      let scopedSession='';
      try {scopedSession=sessionStorage.getItem(scopedSessionKey)||'';} catch {}
      if(!/^[a-zA-Z0-9_-]{3,80}$/.test(scopedSession)){
        scopedSession='session-'+(crypto.randomUUID?.()||Date.now().toString(36));
        try {sessionStorage.setItem(scopedSessionKey,scopedSession);} catch {}
      }
      activeSessionId=scopedSession;
      REPORT_STORAGE_KEY='labvirt-working-report-v1:'+activeSessionId;
      const scoped=readPortalProgress();
      localRecords=cleanRecords(data.records||scoped.savedRecords);
      savePortalRecords(localRecords);
      // Không tự trộn số liệu của sinh viên khác hoặc phiên thử nghiệm cũ.
      render();
      if(window.parent!==window)window.parent.postMessage({type:'labvirt:portal-progress',progress:{part:scoped.part||1,records:localRecords.length}},location.origin);
    }else if(Array.isArray(data.records)){const rows=cleanRecords(data.records);const merged=cleanRecords([...rows,...localRecords]);if(JSON.stringify(merged)!==JSON.stringify(localRecords)){localRecords=merged;savePortalRecords(localRecords);if(state.view!=='workbench')render();}}
    return;
  }
  if(data.type==='academy:open-view' && VIEW_SET.has(data.view)){
    state.view=data.view;
    if([1,2,3,4].includes(Number(data.part)))state.part=Number(data.part);
    setViewHistory();render();
  }
});


// Main site's Biscot is the single identity. Relay data only across same-origin frames.
let academyBiscotConfig=null;
function forwardBiscotToAcademy(data){
 if(window.parent===window)return;
 const permitted=['labvirt:biscot-ready','labvirt:biscot-ask','labvirt:biscot-animation','labvirt:biscot-open','labvirt:biscot-close'];
 if(permitted.includes(data.type))window.parent.postMessage(data,location.origin);
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin || !event.data || typeof event.data!=='object')return;
 const data=event.data;
 if(event.source===runtimeFrame.contentWindow && typeof data.type==='string' && data.type.startsWith('labvirt:biscot-')){
  forwardBiscotToAcademy(data);
  if(data.type==='labvirt:biscot-ready' && academyBiscotConfig)runtimeFrame.contentWindow?.postMessage(academyBiscotConfig,location.origin);
 }
 if(event.source===window.parent && window.parent!==window &&
    ['academy:biscot-config','academy:biscot-reply'].includes(data.type)){
  if(data.type==='academy:biscot-config')academyBiscotConfig={type:data.type,assetUrl:data.assetUrl,answerEnabled:data.answerEnabled===true};
  runtimeFrame.contentWindow?.postMessage(data,location.origin);
 }
});
if(window.parent!==window){window.parent.postMessage({type:'labvirt:studio-ready'},location.origin);}

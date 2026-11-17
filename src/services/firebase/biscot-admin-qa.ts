import { getIdTokenResult, type User } from 'firebase/auth';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from './config';
import { PRESENCE_TIMEOUT_MS, type StudentPresence } from '@/features/lab/services/student-presence';
import type { LiveLabRoom } from '@/features/lab/services/live-lab-rooms';
import type { LabSession, RosterStudent } from '@/features/lab/lab-model';

/**
 * Truy van du lieu lop tai client da dang nhap: KHONG gui ho ten, MSSV hay phien
 * thuc hanh sang Gemini. Firestore Rules moi la lop phan quyen bat buoc.
 * Khong su dung Admin SDK / Service Account o trinh duyet.
 */
const WITHDRAWN = 'DEMO21175';
const MAX_ROSTER = 120;
const MAX_SESSIONS_PER_STUDENT = 200;
const MAX_DISPLAY = 46;

type Intent = 'overview' | 'online' | 'preparing' | 'rooms' | 'roster' | 'lookup' | 'progress';
type Student = RosterStudent & { uid: string };

type InterpretResult = { kind: Intent; target: string; practicalId: string | null } | null;

/** Chuẩn hóa dấu tiếng Việt để nhận dạng cả câu hỏi có/không dấu. */
export function normalizeVietnamese(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function interpretAdminQuestion(question: string): InterpretResult {
  const text = normalizeVietnamese(question);
  const academicTheory = /\b(giai thich|nguyen ly|khai niem|dinh nghia|tai sao|vi sao|cong thuc|cach do|cach lam|phuong phap)\b/.test(text);
  // Tranh nham cau hoi ly thuyet vat ly ve phong Lab thanh truy van danh sach lop.
  const explicitRoster = /\b(mssv|ma sinh vien|danh sach sinh vien|danh sach lop|si so|ho so sinh vien|tim sinh vien|tra cuu sinh vien|ban hoc|hoc vien nao|sinh vien nao|sinh vien ten|bao nhieu sinh vien|46 sinh vien)\b/.test(text);
  const explicitClass = /\b(lop hoc|lop cua toi|lop minh|quan ly lop|thong ke lop|thong ke sinh vien|tien do lop|46 phong|cac phong lab|phong lab nao)\b/.test(text);
  const activity = /\b(online|truc tuyen|dang hoat dong|dang xem|dang hoc|dang thuc hanh|dang chuan bi|dang mo phong|ai dang|bao nhieu nguoi dang|bao nhieu ban dang)\b/.test(text);
  const score = /\b(tien do|ket qua|chua hoan thanh|da hoan thanh|chua dat|da dat|cham diem|duoc duyet|chua duyet|bao cao hoc tap)\b/.test(text);
  const id = question.toUpperCase().match(/76DCVV\d{5}/)?.[0] || '';
  const practicalMatch = text.match(/\bbai\s*([123])\s*[.-]\s*([1-4])\b/);
  const practicalId = practicalMatch ? `L0${practicalMatch[1]}-P0${practicalMatch[2]}` : null;
  if (id) return { kind: 'lookup', target: id, practicalId };
  if (academicTheory && !explicitRoster && !explicitClass && !activity && !score) return null;
  if (score && (explicitRoster || explicitClass || /\b(ai|bao nhieu|lop|sinh vien|hoc vien)\b/.test(text))) return {kind:'progress',target:'',practicalId};
  if (activity && /\b(chuan bi|phong|thuc hanh)\b/.test(text)) return {kind:'preparing',target:'',practicalId};
  if (activity) return {kind:'online',target:'',practicalId};
  if (/\b(phong lab|phong thuc hanh)\b/.test(text) && (explicitClass || /\b(bao nhieu|trang thai|danh sach)\b/.test(text))) return {kind:'rooms',target:'',practicalId};
  if (explicitRoster && /\b(tim|tra cuu|ten)\b/.test(text)) {
    const m = text.match(/(?:tim sinh vien|tra cuu sinh vien|sinh vien ten|ten sinh vien)\s+(.+)/);
    const target = (m?.[1] || '').replace(/[?!.,]+$/,'').trim();
    return {kind:'lookup',target,practicalId};
  }
  if (explicitRoster) return {kind:'roster',target:'',practicalId};
  if (explicitClass || /\b(tong quan lop|thong ke lop|tinh hinh lop)\b/.test(text)) return {kind:'overview',target:'',practicalId};
  return null;
}

function labeled(name: Student): string { return `${name.fullName} (${name.studentCode})`; }
function rosterFromDocs(rows: RosterStudent[]): Student[] {
  return rows
    .filter(r => r.studentCode && r.enrollmentStatus !== 'withdrawn' && r.studentCode.toUpperCase() !== WITHDRAWN)
    .map(r => ({...r,uid: typeof r.uid === 'string' ? r.uid : ''}))
    .sort((a,b)=>a.studentCode.localeCompare(b.studentCode));
}
function online(p: StudentPresence | undefined, now: number): boolean {
  const t = p?.updatedAt?.toMillis?.();
  return Boolean(p?.online && typeof t === 'number' && t <= now && now-t < PRESENCE_TIMEOUT_MS);
}
function nameList(items: Student[], description: string): string {
  if (!items.length) return `${description}: không ghi nhận trường hợp nào trong dữ liệu đang có.`;
  return `${description} (${items.length}):\n${items.slice(0,MAX_DISPLAY).map((r,i)=>`${i+1}. ${labeled(r)}`).join('\n')}`;
}

/** Chỉ khi Intent phù hợp mới đọc Firestore, người không phải Owner tuyệt đối không đọc toàn lớp. */
export async function answerClassQuestion(user: User, question: string): Promise<string | null> {
  const intent = interpretAdminQuestion(question);
  if (!intent) return null;
  const role = await getIdTokenResult(user);
  if (role.claims.admin !== true || role.claims.owner !== true) {
    return 'Thông tin toàn lớp chỉ dành cho tài khoản giảng viên có quyền Admin Owner. Bạn vẫn có thể hỏi mình về các môn học và nội dung giáo trình nhé.';
  }
  // Rules /labRoster chi cho adminReader: kiem tra role tren client KHONG thay the Rules.
  const snapshot = await getDocs(query(collection(db,'labRoster'),limit(MAX_ROSTER)));
  if (snapshot.size === MAX_ROSTER) return 'Danh sách lớp vượt ngưỡng truy vấn an toàn (120 hồ sơ). Vui lòng mở Quản trị phòng Lab để xem dữ liệu đầy đủ.';
  const students = rosterFromDocs(snapshot.docs.map(d => ({...d.data(),id:d.id} as RosterStudent)));
  if (!students.length) return 'Chưa có danh sách lớp trong Firestore hoặc danh sách chưa được liên kết. Không thể suy đoán tên/số lượng sinh viên.';
  const now = Date.now();
  const presentDocs = intent.kind === 'progress' || intent.kind === 'roster'
    ? null : await getDocs(query(collection(db,'labPresence'),limit(MAX_ROSTER)));
  const presence: Record<string,StudentPresence> = {};
  presentDocs?.docs.forEach(d => { presence[d.id] = d.data() as StudentPresence; });
  const roomDocs = intent.kind === 'rooms' || intent.kind === 'preparing' || intent.kind === 'overview' || intent.kind === 'lookup'
    ? await getDocs(query(collection(db,'labLiveRooms'),limit(MAX_ROSTER))) : null;
  const rooms: Record<string,LiveLabRoom> = {};
  roomDocs?.docs.forEach(d=> { rooms[d.id]=d.data() as LiveLabRoom; });
  const activeNow = () => students.filter(r=>r.uid && online(presence[r.uid],now));
  const preparingNow = () => students.filter(r=>r.uid && online(presence[r.uid],now) &&
    (presence[r.uid]?.mode === 'LAB_PENDING' || presence[r.uid]?.mode === 'PREPARING'));
  const note = '\nLưu ý: Trực tuyến được suy ra từ cập nhật web trong 150 giây; "chuẩn bị" không có nghĩa đã lắp mạch/đo điện trong Unity 3D.';
  if (intent.kind === 'online') {
    return `${nameList(activeNow(),'Sinh viên đang trực tuyến')}${note}`;
  }
  if (intent.kind === 'preparing') {
    return `${nameList(preparingNow(),'Sinh viên đang mở bước chuẩn bị')}${note}`;
  }
  if (intent.kind === 'roster') {
    return `Danh sách đang học: ${students.length} sinh viên trong Firestore.\n${nameList(students,'Các hồ sơ')}\nKhông bao gồm sinh viên đã đánh dấu nghỉ học.`;
  }
  if (intent.kind === 'rooms') {
    const opened = students.filter(r=>r.uid && rooms[r.uid]);
    return `Lớp có ${students.length} sinh viên đang học; ${opened.length} phòng từng ghi trạng thái chuẩn bị, ${students.length-opened.length} phòng chưa có bản ghi. Chưa có hình ảnh Unity 3D hoặc kết quả đo đã xác minh.`;
  }
  if (intent.kind === 'overview') {
    const active = activeNow(); const prep = preparingNow();
    const opened = students.filter(r=>r.uid && rooms[r.uid]);
    return `Tổng quan lớp (dữ liệu Firestore tại thời điểm hỏi):\n- Sinh viên đang học: ${students.length}\n- Đang trực tuyến: ${active.length}\n- Đang xem bước chuẩn bị: ${prep.length}\n- Phòng từng mở phần chuẩn bị: ${opened.length}\n- Chưa có bản ghi phòng: ${students.length-opened.length}${note}`;
  }
  if (intent.kind === 'lookup') {
    if (!intent.target) return 'Hãy nhập MSSV hoặc tên sinh viên cần tra cứu, ví dụ: “Tìm sinh viên DEMO21166”.';
    const term = normalizeVietnamese(intent.target);
    const matched = students.filter(r => normalizeVietnamese(r.studentCode).includes(term) || normalizeVietnamese(r.fullName).includes(term));
    if (!matched.length) return 'Không tìm thấy sinh viên khớp trong danh sách đang học. Hãy kiểm tra lại tên hoặc MSSV.';
    const lines = matched.slice(0,10).map(r=>{
      // Truy vấn riêng trạng thái từng người, tránh đọc Firestore không cần thiết.
      const p = presence[r.uid];const room=rooms[r.uid];
      return `- ${labeled(r)} · Lớp: ${r.className || 'chưa cập nhật'} · Phòng: ${room ? 'đã mở chuẩn bị':'chưa ghi nhận'} · Trực tuyến: ${p ? (online(p,now)?'có':'không') : 'chưa kiểm tra'}`;
    });
    return `Kết quả tra cứu (${matched.length}):\n${lines.join('\n')}\nCác trạng thái chỉ phản ánh website, không chứng minh hoàn thành bài thực hành.`;
  }
  if (intent.kind === 'progress') {
    const eligible = students.filter(r=>Boolean(r.uid));
    const sessions: Record<string,LabSession[]> = {};
    const failed: string[] = [];
    // Đọc tối đa 6 sinh viên đồng thời, không tạo 46 listeners lâu dài.
    for (let start=0;start<eligible.length;start+=6) {
      const batch = eligible.slice(start,start+6);
      const results = await Promise.allSettled(batch.map(async r=>{
        const snap = await getDocs(query(collection(db,'users',r.uid,'labSessions'),limit(MAX_SESSIONS_PER_STUDENT)));
        if (snap.size===MAX_SESSIONS_PER_STUDENT) throw new Error('SESSION_LIMIT');
        return snap.docs.map(d=>({...d.data(),id:d.id} as LabSession));
      }));
      results.forEach((result,i)=> {const r=batch[i];if (!r) return;
        if(result.status==='fulfilled') sessions[r.uid]=result.value;
        else failed.push(r.studentCode);
      });
    }
    if (failed.length) return `Chưa thể thống kê toàn lớp chính xác vì ${failed.length} hồ sơ chưa đọc đủ phiên thực hành (${failed.join(', ')}). Hãy thử lại hoặc xem Dashboard Admin.`;
    if (!intent.practicalId) {
      const all = eligible.flatMap(r=>sessions[r.uid]??[]);
      const passed = all.filter(s=>s.status==='PASSED').length;
      const failedCount = all.filter(s=>s.status==='FAILED').length;
      return `Thống kê phiên thực hành đã ghi trên Firestore:\n- Sinh viên đang học: ${students.length}\n- Hồ sơ có UID để tra cứu: ${eligible.length}\n- Tổng phiên đã mở: ${all.length}\n- Phiên được duyệt đạt: ${passed}\n- Phiên bị đánh giá chưa đạt: ${failedCount}\n- Chưa được duyệt: ${all.length-passed-failedCount}\nLưu ý: đếm theo PHIÊN, không phải số sinh viên hoàn thành; chưa có minh chứng Unity 3D thì không tự kết luận đã đo thật.`;
    }
    const noPass = eligible.filter(r=>!(sessions[r.uid]??[]).some(s=>s.practicalId===intent.practicalId && s.status==='PASSED'));
    const passedStudents = eligible.length-noPass.length;
    const unlinked=students.length-eligible.length;
    return `Bài ${intent.practicalId}: ${passedStudents}/${eligible.length} hồ sơ có UID đã có ít nhất một phiên được duyệt PASSED.\n${nameList(noPass,'Chưa tìm thấy phiên được duyệt PASSED')}\n${unlinked ? `${unlinked} hồ sơ chưa liên kết UID nên không thể kiểm tra.\n`:''}Không có trạng thái PASSED không đồng nghĩa sinh viên chưa học hoặc đã trượt; kết quả thực hành thật cần minh chứng đáng tin cậy.`;
  }
  return null;
}

/** LABVIRT V16 - Knowledge-first retrieval. Không gọi model khi cache có kết quả.
 * An toàn: câu hỏi về số đo/trạng thái cá nhân không dùng kết quả cũ.
 * Chỉ câu kiến thức ổn định được cache tự động tại thiết bị; mọi người dùng cùng dùng 200 câu đã duyệt.
 */
const URL = '/labvirt/lab-v11/biscot-knowledge.json';
const STORAGE = 'labvirt:biscot:qa1:pending:';
const TTL = 60 * 24 * 3600 * 1000;
const MAX_CACHE = 120;
const MAX_QUESTION = 900;
let bankPromise;
const metrics={seedHits:0,cacheHits:0,misses:0,cacheErrors:0,geminiCalls:0,geminiErrors:0,responses:0,totalResponseMs:0};
export function recordKnowledgeMetric(name,value=1){if(Object.hasOwn(metrics,name)&&Number.isFinite(value)&&value>=0)metrics[name]+=value;}
const storageKey=scope=>typeof scope==='string'&&/^[A-Za-z0-9:_-]{1,160}$/.test(scope)?STORAGE+scope:null;

export function normalizeQuestion(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().replace(/đ/g, 'd')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ôhm|ohm|om)\b/g, 'ohm')
    .replace(/[ΩΩω]/g, ' ohm ').replace(/[µμ]/g, 'u')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}


const PRIVATE = /\b(mat khau|password|token|api key|gmail|email|so dien thoai|uid|mssv|ma sinh vien|dia chi|lop hoc|diem so|tai khoan|dang nhap|lich su|firestore|cham diem)\b/;
const STOP = new Set('la gi cua tai sao vi sao nhu the nao co duoc khong bao nhieu trong de va hay hay cho toi minh em ban khi neu voi theo o mot tren ve dau vao ra duoc can phai se thuong cach y nghia lam la'.split(' '));
const split = text => normalizeQuestion(text).split(' ').filter(t => t && !STOP.has(t));

/** Câu hỏi về thao tác hoặc số đo tức thời không được lấy câu trả lời cũ. */
export function isLiveStateQuestion(text) {
  const key=normalizeQuestion(text);
  // Phân biệt câu lý thuyết an toàn "Có được đo mạch đang cấp nguồn không?"
  // với quan sát thời gian thực "Mạch của em đang cấp nguồn đúng chưa?".
  const personal=/\b(cua em|cua toi|cua minh|em|toi|minh|hien tai|luc nay|bay gio|vua|hom nay|tren man hinh|tren dmm|cua toi|toi cam|em cam|tien do|hoan thanh|vua ghi|da ghi)\b/;
  const measured=/\b(dmm|dong ho|lcd|que|que do|que den|que do|pin|lo|l o|o l|mach|linh kien|dien|ket qua|so do|buoc|bang|cam|ghi|trang thai|hoan thanh|nguon)\b/;
  const observed=/\b(dmm|dong ho|lcd|que do|que den|que do)\b.*\b(dang hien|dang cam|hien o l|hien ol|khong hien|sai|khong do duoc)\b/;
  const recent=/\b(ket qua|so do|bang|tien do|lan cuoi|vua do|vua ghi|da cam|chua cam|huong dan buoc tiep)\b/;
  return (personal.test(key)&&measured.test(key)) || observed.test(key) || recent.test(key);
}
/** Không cache bài toán có số liệu riêng, nhận dạng cá nhân, yêu cầu hành động hoặc lịch sử hội thoại. */
export function isSafeKnowledgeQuestion(question) {
  const q=String(question??'').trim();
  const key=normalizeQuestion(q);
  if (!q || q.length>MAX_QUESTION || key.length<10) return false;
  if (isLiveStateQuestion(q) || PRIVATE.test(key)) return false;
  if (/\d/.test(key)) return false; // câu cụ thể với thông số cần tính lại, không cache tự động
  if (/\b(chao|biet on|nhay|hat|mua|thoi tiet|tin tuc|luc nao|gia|co phieu|dien dan)\b/.test(key)) return false;
  return true;
}
async function getBank() {
  if (!bankPromise) {
    bankPromise=fetch(URL,{cache:'no-cache'}).then(async response=>{
      if (!response.ok) throw new Error('KNOWLEDGE_BANK_HTTP');
      const data=await response.json();
      if (!Array.isArray(data?.entries) || data.entries.length!==200) throw new Error('KNOWLEDGE_BANK_INVALID');
      const exact=new Map(),entries=[];
      for (const item of data.entries) {
        if (!/^KB\d{3}$/.test(item.id) || typeof item.answer!=='string' || item.review!=='curated') throw new Error('KNOWLEDGE_ENTRY_INVALID');
        const forms=[item.question,...(Array.isArray(item.aliases)?item.aliases:[])];
        for(const form of forms)exact.set(normalizeQuestion(form),item);
        entries.push({...item,tokens:new Set(split(item.question))});
      }
      if(new Set(entries.map(item=>item.id)).size!==200)throw new Error('KNOWLEDGE_IDS_INVALID');
      return {exact,entries};
    }).catch(error=>{ bankPromise=undefined; throw error; });
  }
  return bankPromise;
}
function lexicalMatch(query, entries) {
  const a=new Set(split(query));
  if(a.size<3) return null;
  let best=null,second=0;
  for(const item of entries){
    const b=item.tokens;
    if(b.size<3)continue;
    let shared=0;
    for(const t of a)if(b.has(t))shared++;
    const score=shared/Math.max(a.size,b.size);
    if(score>(best?.score??0)){second=best?.score??0;best={item,score};}
    else if(score>second)second=score;
  }
  if(!best||best.score<0.91 || best.score-second<0.15)return null;
  return best.item;
}
export async function findSeedAnswer(question) {
  try{
    const bank=await getBank();
    const key=normalizeQuestion(question);
    // Câu nằm chính xác trong giáo trình là kiến thức cố định; chỉ tra gần đúng khi không phải câu live.
    const found=bank.exact.get(key) || (!isLiveStateQuestion(question) ? lexicalMatch(question,bank.entries) : null);
    if(!found)return null;
    return {text:found.answer, id:found.id, source:found.source, origin:'verified-seed'};
  }catch{return null;}
}
function readLocal(scope){
  const key=storageKey(scope);if(!key)return [];
  try {
    const parsed=JSON.parse(localStorage.getItem(key)||'[]');
    if(!Array.isArray(parsed))return [];
    const now=Date.now();
    return parsed.filter(x=>x&&typeof x.key==='string'&&typeof x.text==='string'&&x.text.length<=2500&&x.status==='unreviewed'&&Number.isFinite(x.at)&&x.at<=now&&now-x.at<TTL).slice(-MAX_CACHE);
  } catch{metrics.cacheErrors++;return [];}
}
export function getSavedAnswer(question,scope){
  if(!isSafeKnowledgeQuestion(question))return null;
  const key=normalizeQuestion(question);
  const entry=readLocal(scope).find(x=>x.key===key);
  return entry?{text:entry.text,source:'Câu trả lời AI được lưu tại trình duyệt này (chưa được giảng viên thẩm định)',origin:'local-ai-cache'}:null;
}
/** Lưu câu hỏi MỚI sau khi AI trả lời thành công; chỉ trên máy người học, KHÔNG đưa dữ liệu cá nhân vào kho chung. */
export function rememberAiAnswer(question,answer,scope){
  const storage=storageKey(scope);if(!storage)return false;
  if(!isSafeKnowledgeQuestion(question) || typeof answer!=='string')return false;
  const cleaned=answer.trim();
  if(PRIVATE.test(normalizeQuestion(cleaned)) || /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{8,}\b|\b76DCVV\d+\b/i.test(cleaned))return false;
  if(cleaned.length<25 || cleaned.length>2500 || /\b(khong biet|khong the|het quota|het han muc|chua co du lieu|xin loi|tai khoan|password|token)\b/.test(normalizeQuestion(cleaned)) || cleaned.startsWith('Mình là AI Biscot, chỉ hỗ trợ'))return false;
  try{
    const key=normalizeQuestion(question),items=readLocal(scope).filter(x=>x.key!==key);
    items.push({key,question:String(question).slice(0,MAX_QUESTION),text:cleaned,at:Date.now(),status:'unreviewed'});
    localStorage.setItem(storage,JSON.stringify(items.slice(-MAX_CACHE)));
    return true;
  }catch{metrics.cacheErrors++;return false;}
}
export async function resolveKnowledge(question,{scope,allowLocal=true}={}){
  const seed=await findSeedAnswer(question);if(seed){metrics.seedHits++;return seed;}
  if(isLiveStateQuestion(question))return null;
  const cached=allowLocal?getSavedAnswer(question,scope):null;
  if(cached)metrics.cacheHits++;else metrics.misses++;
  return cached;
}
/** Same pipeline used by React. A contextual conversation never reads or writes AI cache. */
export async function answerKnowledgeFirst(question,generate,{scope,hasHistory=false}={}){
  const start=performance.now();
  let succeeded=false;
  try{
    const hit=await resolveKnowledge(question,{scope,allowLocal:!hasHistory});
    if(hit){succeeded=true;return hit.origin==='local-ai-cache'?`${hit.text}\n\nNguồn: ${hit.source}.`:hit.text;}
    const answer=await generate();
    if(!hasHistory)rememberAiAnswer(question,answer,scope);
    succeeded=true;
    return answer;
  }finally{if(succeeded){metrics.responses++;metrics.totalResponseMs+=performance.now()-start;}}
}
/** Export các đề xuất mới để Admin duyệt và xuất bản thành kho dùng chung ở lần phát hành sau. */
export function exportUnreviewedJson(scope){
  const items=readLocal(scope).map(({question,text,at})=>({question,answer:text,createdAt:new Date(at).toISOString(),reviewStatus:'PENDING'}));
  return JSON.stringify({schema:'biscot-reviewed-import-v1',items},null,2);
}
export function knowledgeStats(scope){const hits=metrics.seedHits+metrics.cacheHits;return {seedCount:200,localCount:readLocal(scope).length,localTtlDays:60,...metrics,cacheHitRate:hits+metrics.misses?hits/(hits+metrics.misses):0,averageResponseMs:metrics.responses?metrics.totalResponseMs/metrics.responses:0};}

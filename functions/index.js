import {initializeApp} from 'firebase-admin/app';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {logger} from 'firebase-functions';
import {validateReview} from './lab-review-core.mjs';
import {DAILY_LIMIT, answerWithAI, buildTutorInstructions, offlineGuidance, sanitizeHistory, validateId, validateProviderChoice, validateQuestion} from './tutor-core.mjs';
initializeApp();
const db = getFirestore();
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const openaiApiKey = defineSecret('OPENAI_API_KEY');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

async function resolveContext(uid, experimentId, practicalId, sessionId) {
  const empty = {experimentTitle:'Chưa chọn bài',practicalTitle:'Chưa chọn bài nhỏ',objective:'',instructions:[],requiredEvidence:[],equipment:[],safetyChecks:[],scenarios:[],labReadiness:'NOT_BUILT',sessionStatus:'Chưa có phiên'};
  // Trang phòng lab chỉ biết sessionId: lấy bài từ phiên đã được xác thực.
  if (sessionId && !experimentId && !practicalId) {
    const session = await db.collection('users').doc(uid).collection('labSessions').doc(sessionId).get();
    const value=session.data();
    if (!session.exists || value?.uid!==uid || !validateId(value.experimentId) || !validateId(value.practicalId)) throw new HttpsError('permission-denied','Phiên thực hành không hợp lệ.');
    return resolveContext(uid,value.experimentId,value.practicalId,sessionId);
  }
  if (!experimentId || !practicalId) return empty;
  const ref = await db.collection('labExperiments').doc(experimentId).get();
  if (!ref.exists) throw new HttpsError('not-found','Bài thí nghiệm không tồn tại.');
  const experiment = ref.data();
  if (!experiment?.published) throw new HttpsError('permission-denied','Bài thí nghiệm chưa được công bố.');
  const practical = Array.isArray(experiment.practicals) ? experiment.practicals.find(item => item.id === practicalId) : null;
  if (!practical) throw new HttpsError('not-found','Không tìm thấy bài thực hành nhỏ.');
  let sessionStatus='Chưa có phiên';
  if (sessionId) {
    const session = await db.collection('users').doc(uid).collection('labSessions').doc(sessionId).get();
    const value = session.data();
    if (!session.exists || value?.uid!==uid || value?.experimentId!==experimentId || value?.practicalId!==practicalId) {
      throw new HttpsError('permission-denied','Phiên thực hành không thuộc người dùng và bài đang chọn.');
    }
    sessionStatus = String(value.status);
  }
  return {experimentTitle:String(experiment.title||'').slice(0,250),practicalTitle:String(practical.title||'').slice(0,250),objective:String(practical.objective||'').slice(0,500),instructions:Array.isArray(practical.instructions)?practical.instructions.slice(0,30).map(v=>String(v).slice(0,300)):[],requiredEvidence:Array.isArray(practical.requiredEvidence)?practical.requiredEvidence.slice(0,20).map(v=>String(v).slice(0,200)):[],equipment:Array.isArray(practical.equipment)?practical.equipment.slice(0,35).map(v=>String(v.name||'').slice(0,100)):[],safetyChecks:Array.isArray(practical.safetyChecks)?practical.safetyChecks.slice(0,20).map(v=>String(v).slice(0,250)):[],scenarios:Array.isArray(practical.scenarios)?practical.scenarios.slice(0,30).map(v=>({category:String(v.category||''),title:String(v.title||'').slice(0,100)})):[],labReadiness:String(practical.labReadiness||'NOT_BUILT'),sessionStatus};
}

/** Callable Function: xác thực từ Firebase Auth + giới hạn câu hỏi theo UID/ngày. */
export const askLabTutor = onCall({region:'asia-southeast1',timeoutSeconds:45,memory:'256MiB',maxInstances:3,secrets:[geminiApiKey,openaiApiKey]},async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Hãy đăng nhập để hỏi trợ giảng.');
  const uid = request.auth.uid;
  let question;
  try { question=validateQuestion(request.data?.question); } catch(e) {throw new HttpsError('invalid-argument',e.message);}
  const experimentId=validateId(request.data?.experimentId);
  const practicalId=validateId(request.data?.practicalId);
  const sessionId=validateId(request.data?.sessionId);
  if ((request.data?.experimentId && !experimentId)||(request.data?.practicalId && !practicalId)||(request.data?.sessionId && !sessionId)) throw new HttpsError('invalid-argument','ID không hợp lệ.');
  if (Boolean(experimentId)!==Boolean(practicalId)) throw new HttpsError('invalid-argument','Cần truyền cả bài lớn và bài nhỏ.');
  let choice;
  try { choice=validateProviderChoice(request.data?.provider); }
  catch(e){throw new HttpsError('invalid-argument',e.message);}
  const context = await resolveContext(uid,experimentId,practicalId,sessionId);
  // Mỗi UID bị giới hạn để tránh gửi yêu cầu API ngoài kiểm soát.
  const date=new Date().toISOString().slice(0,10);
  const usageRef=db.collection('tutorDailyUsage').doc(`${uid}_${date}`);
  await db.runTransaction(async tx => {
    const snap=await tx.get(usageRef);
    const count=snap.exists?Number(snap.get('count')||0):0;
    if (count>=DAILY_LIMIT) throw new HttpsError('resource-exhausted',`Đã hết ${DAILY_LIMIT} câu hỏi trong ngày. Vui lòng thử ngày mai.`);
    tx.set(usageRef,{uid,date,count:count+1,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  const history = sanitizeHistory(request.data?.history);
  let reply, engine='RULE_BASED';
  try {
    // Chỉ backend đọc Secret Manager. Client chỉ gửi 'auto', 'gemini' hoặc 'openai'.
    const result=await answerWithAI({
      choice,
      keys:{gemini:geminiApiKey.value(),openai:openaiApiKey.value()},
      models:{gemini:GEMINI_MODEL,openai:OPENAI_MODEL},
      instructions:buildTutorInstructions(context),question,history,
      onError:(provider,error)=>logger.warn('AI Biscot provider error',{provider,status:String(error.message).slice(0,150)})
    });
    reply=result.reply??offlineGuidance(question,context);
    engine=result.engine;
  }catch(error){
    logger.error('AI Biscot not available',{choice,reason:String(error.message).slice(0,150),uid});
    throw new HttpsError('unavailable','AI Biscot chưa kết nối được nhà cung cấp đã chọn. Hãy kiểm tra API key, hạn mức và cấu hình model.');
  }
  const chatRef=db.collection('users').doc(uid).collection('tutorChats').doc();
  await chatRef.set({uid,question,reply,engine,requestedProvider:choice,experimentId:experimentId||null,practicalId:practicalId||null,sessionId:sessionId||null,createdAt:FieldValue.serverTimestamp()});
  return {reply,engine,contextTitle:context.practicalTitle,chatId:chatRef.id};
});

/** Đánh giá server-side; client không được trực tiếp cập nhật score/status Firestore. */
export const reviewLabSession = onCall({region:'asia-southeast1',timeoutSeconds:30,memory:'256MiB'}, async request=>{
  if (!request.auth || request.auth.token?.admin !== true || request.auth.token?.owner !== true) {
    throw new HttpsError('permission-denied','Chỉ tài khoản quản trị được phân quyền mới được đánh giá.');
  }
  if(request.data?.operation==='capabilities')return {reviewSchemaVersion:2,optimisticConcurrency:true};
  const {uid,sessionId,result,score,note,expectedRevision}=request.data??{};
  if (!validateId(uid) || !validateId(sessionId)) throw new HttpsError('invalid-argument','Mã người học hoặc phiên không hợp lệ.');
  if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw new HttpsError('invalid-argument','Thiếu phiên bản đánh giá. Hãy tải lại hồ sơ.');
  const sessionRef=db.collection('users').doc(uid).collection('labSessions').doc(sessionId);
  return db.runTransaction(async transaction=>{
  const session=await transaction.get(sessionRef);
  if (!session.exists || session.data()?.uid!==uid) throw new HttpsError('not-found','Không tìm thấy phiên cần đánh giá.');
  const sessionData=session.data();
  if((sessionData.reviewRevision??0)!==expectedRevision)throw new HttpsError('aborted','Đánh giá đã thay đổi ở phiên khác. Hãy tải lại trước khi lưu.');
  const experimentSnap=await transaction.get(db.collection('labExperiments').doc(sessionData.experimentId));
  const practical=experimentSnap.exists && Array.isArray(experimentSnap.data()?.practicals)
    ? experimentSnap.data().practicals.find(p=>p.id===sessionData.practicalId) : null;
  if (!practical) throw new HttpsError('failed-precondition','Bài thực hành không còn tồn tại.');
  const trusted=await transaction.get(sessionRef.collection('labEvidence').doc('trusted-verification'));
  const ev=trusted.data();
  const hasTrustedMeasurement=trusted.exists && ev?.source==='TRUSTED_BACKEND' && ev?.verified===true
    && ev?.sessionId===sessionId && ['MEASUREMENT','CIRCUIT_SUBMISSION'].includes(ev?.kind);
  let review;
  try { review=validateReview({result,score,note,minimumScore:Number(practical.minimumScore),hasTrustedMeasurement}); }
  catch(e){throw new HttpsError('failed-precondition',e.message);}
  const history=Array.isArray(sessionData.reviewHistory)?sessionData.reviewHistory:[];
  if(history.length>=50)throw new HttpsError('resource-exhausted','Hồ sơ đã có 50 lần điều chỉnh. Cần đối soát quản trị trước khi sửa tiếp.');
  if(sessionData.reviewedAt)history.push({status:sessionData.status,score:sessionData.score??null,note:sessionData.reviewNote??'',reviewedBy:sessionData.reviewedBy??'',reviewedAt:sessionData.reviewedAt,revision:sessionData.reviewRevision??0});
  transaction.update(sessionRef,{status:review.result,score:review.score,reviewNote:review.note,reviewedBy:request.auth.uid,reviewedAt:FieldValue.serverTimestamp(),reviewRevision:expectedRevision+1,reviewHistory:history});
  return {status:review.result,score:review.score,reviewRevision:expectedRevision+1};
  });
});

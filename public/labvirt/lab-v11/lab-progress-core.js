import { validateSavedEntries } from './measurement-core.js';
import { STEPS } from './lab-lessons.js';

export const PRACTICE_STEP_IDS=Object.freeze(STEPS.map(step=>step.id));
export function completedPracticeSteps(context){
  if(!context?.ready || !context.acted)return [];
  return STEPS.flatMap((step,index)=>step.check(context)?[index]:[]);
}

export const PROGRESS_LESSON='B1_P1';
export const PROGRESS_TOTAL=18;
const COMPONENTS=['R1','R2','R3','C1','C2','L'];
const DEFECTS=['NORMAL','SHORT','OPEN'];
const CASE_KEYS=new Set(COMPONENTS.flatMap(c=>DEFECTS.map(d=>`${c}:${d}`)));
export const progressStorageKey=uid=>`labvirt:b1:qa1:${uid}`;

/** Client consistency check only. These rows never establish server-verified assessment. */
export function mergeProgressRecords(...sets){
  const rows=sets.flatMap(x=>Array.isArray(x)?x:[]);
  rows.sort((a,b)=>String(a?.recordedAt??'').localeCompare(String(b?.recordedAt??'')));
  return validateSavedEntries(rows);
}
export function progressSummary(records,activity={}){
  const valid=mergeProgressRecords(records);
  const completed=new Set(valid.map(row=>row.key));
  const started=[...new Set([...(Array.isArray(activity.startedCases)?activity.startedCases:[]),...completed])].filter(key=>CASE_KEYS.has(key));
  const current=CASE_KEYS.has(activity.currentCase)?activity.currentCase:null;
  return {lessonId:PROGRESS_LESSON,total:PROGRESS_TOTAL,completed:completed.size,remaining:PROGRESS_TOTAL-completed.size,
    percent:Math.round(completed.size/PROGRESS_TOTAL*100),startedCases:started,currentCase:current,
    activeMs:Number.isFinite(activity.activeMs)?Math.max(0,Math.min(activity.activeMs,604800000)):0,
    helpCount:Number.isInteger(activity.helpCount)?Math.max(0,Math.min(activity.helpCount,100000)):0,
    errors:Object.fromEntries(Object.entries(activity.errors||{}).filter(([k,v])=>/^[A-Z_]{1,50}$/.test(k)&&Number.isInteger(v)&&v>0).slice(0,30)),
    verifiedByTeacher:false};
}

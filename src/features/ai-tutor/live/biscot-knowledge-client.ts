/** V16: dùng chung kho câu hỏi đã duyệt giữa website chính và iframe LABVIRT.
 * Import runtime từ /public, không đóng gói trùng 200 câu vào JS React.
 */
type Answer={text:string;source:string;id?:string;origin:'verified-seed'|'local-ai-cache'};
type Engine={
  resolveKnowledge(question:string,options?:{scope?:string;allowLocal?:boolean}):Promise<Answer|null>;
  isLiveStateQuestion(question:string):boolean;
  rememberAiAnswer(question:string,answer:string,scope?:string):boolean;
  recordKnowledgeMetric(name:string,value?:number):void;
  answerKnowledgeFirst(question:string,generate:()=>Promise<string>,options:{scope:string;hasHistory:boolean}):Promise<string>;
};
let modulePromise:Promise<Engine>|undefined;
async function engine():Promise<Engine|null>{
  if(!modulePromise){
    const path=new URL('/labvirt/lab-v11/biscot-knowledge-engine.js',window.location.origin).href;
    modulePromise=import(/* @vite-ignore */ path) as Promise<Engine>;
  }
  try{return await modulePromise;}catch{modulePromise=undefined;return null;}
}
export async function resolveBiscotKnowledge(question:string,scope?:string,allowLocal=true):Promise<Answer|null>{
  const api=await engine();
  return api ? api.resolveKnowledge(question,{scope,allowLocal}) : null;
}
export async function saveBiscotKnowledge(question:string,answer:string,scope?:string):Promise<boolean>{
  const api=await engine();
  return api ? api.rememberAiAnswer(question,answer,scope) : false;
}
export async function recordBiscotMetric(name:string,value=1){(await engine())?.recordKnowledgeMetric(name,value);}
export async function answerBiscotKnowledgeFirst(question:string,generate:()=>Promise<string>,scope:string,hasHistory:boolean){
  const api=await engine();return api?api.answerKnowledgeFirst(question,generate,{scope,hasHistory}):generate();
}
export async function isLiveBiscotQuestion(question:string):Promise<boolean>{
  const api=await engine();
  return api ? api.isLiveStateQuestion(question) : true;
}

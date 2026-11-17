import {askBiscotGemini as generate} from '@/services/firebase/ai-biscot';
import {auth} from '@/services/firebase/config';
import {answerBiscotKnowledgeFirst} from './biscot-knowledge-client';
export * from '@/services/firebase/ai-biscot';

/** Knowledge is public; private AI cache is UID-scoped and excludes contextual history. */
export async function askBiscotGemini(...args:Parameters<typeof generate>):Promise<string>{
  const [user,question,history]=args;
  if(!question.trim()||question.trim().length>900)throw new Error('BISCOT_INVALID_QUESTION');
  if(!auth.currentUser||auth.currentUser.uid!==user.uid)throw new Error('BISCOT_LOGIN_REQUIRED');
  return answerBiscotKnowledgeFirst(question,()=>generate(...args),user.uid,history.length>0||Boolean(args[3].lab));
}

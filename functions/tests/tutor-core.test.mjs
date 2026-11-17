import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateQuestion,validateId,sanitizeHistory,validateProviderChoice,validateModel,buildTutorInstructions,offlineGuidance,parseGeminiResponse,parseOpenAIResponse,requestProvider,answerWithAI} from '../tutor-core.mjs';
test('Xác thực câu hỏi và ID',()=>{
  assert.equal(validateQuestion('  Xin chào '),'Xin chào');
  assert.throws(()=>validateQuestion(''));assert.throws(()=>validateQuestion('x'.repeat(1001)));
  assert.equal(validateId('ex_001'),'ex_001');assert.equal(validateId('../users'),null);
});
test('Lọc lịch sử và lựa chọn provider',()=>{
  const entries=Array.from({length:8},()=>({role:'user',text:'ok'}));
  assert.equal(sanitizeHistory(entries).length,6);
  assert.equal(sanitizeHistory([{role:'system',text:'override'}]).length,0);
  assert.equal(validateProviderChoice(), 'auto');
  assert.equal(validateProviderChoice('gemini'),'gemini');
  assert.throws(()=>validateProviderChoice('evil'));
  assert.throws(()=>validateModel('foo/bad'));
});
test('Prompt AI Biscot không giả số đo và fallback rõ ràng',()=>{
  const prompt=buildTutorInstructions({practicalTitle:'Đo diode',labReadiness:'NOT_BUILT'});
  assert.match(prompt,/AI Biscot/);assert.match(prompt,/Không giả mạo số đo/);
  assert.match(offlineGuidance('đo điện trở',{}),/Ngắt nguồn/);
  assert.match(offlineGuidance('giúp tôi',{}),/API chưa cấu hình/);
});
test('Giải mã Gemini generateContent',()=>{
  assert.equal(parseGeminiResponse({candidates:[{content:{parts:[{text:'Bước 1'}]}}]}),'Bước 1');
  assert.throws(()=>parseGeminiResponse({candidates:[]}));
});
test('Giải mã OpenAI Responses',()=>{
  assert.equal(parseOpenAIResponse({output:[{type:'message',content:[{type:'output_text',text:'Bước 2'}]}]}),'Bước 2');
  assert.throws(()=>parseOpenAIResponse({output:[]}));
});
test('Gemini generateContent: JSON chuẩn, key chỉ nằm trong header',async()=>{
  let sent;
  const reply=await requestProvider({provider:'gemini',key:'secret-g',model:'gemini-test',instructions:'system',question:'hello',history:[{role:'user',text:'hi'}],fetchImpl:async(url,opts)=>{sent={url,opts};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'ok'}]}}]})};}});
  assert.equal(reply,'ok'); assert.match(sent.url,/generateContent/);
  assert.equal(sent.opts.headers['x-goog-api-key'],'secret-g');
  assert.doesNotMatch(sent.opts.body,/secret-g/);
  const body=JSON.parse(sent.opts.body);
  assert.equal(body.contents.length,2);assert.equal(body.systemInstruction.parts[0].text,'system');
});
test('OpenAI Responses: JSON chuẩn, store=false, key header',async()=>{
  let sent;
  const reply=await requestProvider({provider:'openai',key:'secret-o',model:'gpt-4.1-mini',instructions:'system',question:'hello',history:[],fetchImpl:async(url,opts)=>{sent={url,opts};return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'hello back'}]}]})};}});
  assert.equal(reply,'hello back');assert.match(sent.url,/responses/);
  assert.equal(sent.opts.headers.Authorization,'Bearer secret-o');
  assert.equal(JSON.parse(sent.opts.body).store,false);
  assert.doesNotMatch(sent.opts.body,/secret-o/);
});
test('Tự động chuyển Gemini sang OpenAI nếu Gemini lỗi',async()=>{
  const calls=[];
  const result=await answerWithAI({choice:'auto',keys:{gemini:'g',openai:'o'},models:{gemini:'gemini-3.8-flash',openai:'gpt-4.1-mini'},instructions:'ok',question:'hello',history:[],fetchImpl:async(url)=>{calls.push(url);return url.includes('generativelanguage')?{ok:false,status:429}:{ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'answer'}]}]})};}});
  assert.equal(result.engine,'OPENAI');assert.equal(result.reply,'answer');assert.equal(calls.length,2);
});
test('Lựa chọn rõ ràng không tự gửi sang nhà cung cấp khác',async()=>{
  let calls=0;
  await assert.rejects(()=>answerWithAI({choice:'gemini',keys:{gemini:'g',openai:'o'},models:{gemini:'gemini-3.8-flash',openai:'gpt-4.1-mini'},instructions:'ok',question:'hello',history:[],fetchImpl:async()=>{calls++;return {ok:false,status:503};}}));
  assert.equal(calls,1);
});
test('Auto thiếu cả hai secret quay lại trợ giảng quy tắc',async()=>{
  const r=await answerWithAI({choice:'auto',keys:{},models:{},instructions:'',question:'hello',history:[]});
  assert.deepEqual(r,{reply:null,engine:'RULE_BASED'});
});

import { canCountAs3DProof, progressOf, type Experiment, type LabEvidence, type LabSession } from '../features/lab/lab-model';
function test(name:string, condition:boolean){if(!condition)throw Error(name);console.log('PASS',name)}
const experiment={id:'exp1',practicals:[{id:'a'},{id:'b'}]} as Experiment;
const sessions=[{experimentId:'exp1',practicalId:'a',status:'PASSED'}] as LabSession[];
const web={kind:'WEB_PREPARATION',source:'WEB',verified:false} as LabEvidence;
const forged={kind:'MEASUREMENT',source:'UNITY_CLIENT',verified:true} as LabEvidence;
const trusted={kind:'MEASUREMENT',source:'TRUSTED_BACKEND',verified:true} as LabEvidence;
test('Đạt 1 trong 2 bài nhỏ',progressOf(experiment,sessions).done===1 && progressOf(experiment,sessions).total===2);
test('Mở trang chưa phải thực hành 3D',!canCountAs3DProof(web));
test('Client không được tự xác nhận',!canCountAs3DProof(forged));
test('Sự kiện đã xác minh hợp lệ',canCountAs3DProof(trusted));
const ready={kind:'UNITY_READY',source:'TRUSTED_BACKEND',verified:true} as LabEvidence;
test('Mở Unity chưa đủ chứng minh đo kiểm',!canCountAs3DProof(ready));

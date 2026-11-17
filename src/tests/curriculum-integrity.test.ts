import { OFFICIAL_CURRICULUM, validateCurriculum } from '../features/lab/data/official-curriculum';
import { EQUIPMENT_CATALOG } from '../features/lab/data/equipment-catalog';

function assertTest(name: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
}
assertTest('Đúng 3 bài lớn', OFFICIAL_CURRICULUM.length === 3);
assertTest('Đúng số bài nhỏ 4+3+4', OFFICIAL_CURRICULUM.map(x=>x.practicals.length).join(',') === '4,3,4');
assertTest('Toàn bộ học liệu nhất quán', validateCurriculum(OFFICIAL_CURRICULUM).length === 0);
assertTest('Có tình huống đo sai và lỗi linh kiện', OFFICIAL_CURRICULUM.every(e=>e.practicals.every(p=>p.scenarios?.some(s=>s.category==='FAULT') && p.scenarios.some(s=>s.category==='SAFETY'))));
assertTest('Chưa khai gian đã có lab 3D', OFFICIAL_CURRICULUM.every(e=>!e.published && e.practicals.every(p=>p.labReadiness==='NOT_BUILT')));
assertTest('Mọi bài có thiết bị, quy trình, mẫu đo', OFFICIAL_CURRICULUM.every(e=>e.practicals.every(p=>!!p.equipment?.length && !!p.instructions.length && !!p.measurementFields?.length && !!p.sourcePages?.length)));
const bridge=OFFICIAL_CURRICULUM[0].practicals[2];
assertTest('Mạch chỉnh lưu có kiểm tra ground oscilloscope', !!bridge.scenarios?.some(s=>s.category==='SAFETY' && /mass hai kênh/i.test(s.title)));
const scr=OFFICIAL_CURRICULUM[2].practicals[3];
assertTest('SCR chặn nối tắt A-K nguy hiểm', !!scr.scenarios?.some(s=>s.blocking && /A–K/.test(s.title)));

assertTest('Kho thiết bị đầy đủ và không trùng ID', EQUIPMENT_CATALOG.length >= 25 && new Set(EQUIPMENT_CATALOG.map(e=>e.id)).size === EQUIPMENT_CATALOG.length);
assertTest('Mọi asset khai báo chưa dựng 3D', EQUIPMENT_CATALOG.every(e=>e.assetStatus==='NOT_MODELED' && e.modelPath===null));
assertTest('Đủ DMM, oscilloscope và nguồn DC', ['dmm','oscilloscope','dc-psu'].every(id=>EQUIPMENT_CATALOG.some(e=>e.id===id)));

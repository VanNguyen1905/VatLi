/** LABVIRT V15 — xuất .xlsx hợp lệ, không cần CDN, API hay thư viện nặng.
 * Office Open XML dạng ZIP stored, mỗi ô là inline string nên không chạy công thức do nhập liệu.
 */
import {validateSavedEntries} from './measurement-core.js';
const encoder=new TextEncoder();
const xml=s=>Array.from(String(s??'')).filter(c=>{const n=c.codePointAt(0);return n===9||n===10||n===13||(n>=32&&n<=0xd7ff)||(n>=0xe000&&n<=0xfffd)||(n>=0x10000&&n<=0x10ffff);}).join('').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const column=n=>{let out='';for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
function sheet(rows,header=0){
  const width=Math.max(2,...rows.map(row=>row.length));
  const content=rows.map((values,i)=>`<row r="${i+1}" ht="${i===header||i===0?34:width>2?48:30}" customHeight="1">${values.map((value,j)=>{
    const ref=`${column(j)}${i+1}`;
    const style=i===header||i===0?1:0;
    const numeric=typeof value==='number'&&Number.isFinite(value);
    return numeric?`<c r="${ref}" s="${style}"><v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const merges=rows.flatMap((row,i)=>row.length===1?[`<mergeCell ref="A${i+1}:${column(width-1)}${i+1}"/>`]:[]);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${header+1}" topLeftCell="A${header+2}" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="${width}" width="36" customWidth="1"/></cols><sheetData>${content}</sheetData>${merges.length?`<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`:''}</worksheet>`;
}
const STYLES='<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF091D3A"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function bytes16(n){return [n&255,(n>>>8)&255];}
function bytes32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
function zip(files){
  files['xl/styles.xml']=STYLES;
  // Both workbook manifests below use the same fixed OOXML closing elements.
  files['[Content_Types].xml']=files['[Content_Types].xml'].replace('</Types>','<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  files['xl/_rels/workbook.xml.rels']=files['xl/_rels/workbook.xml.rels'].replace('</Relationships>','<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  const local=[],central=[];let offset=0;
  for(const [name,content]of Object.entries(files)){
    const nameBytes=encoder.encode(name),data=encoder.encode(content),crc=crc32(data);
    const start=new Uint8Array([0x50,0x4b,3,4,20,0,0,8,0,0,0,0,0,0,...bytes32(crc),...bytes32(data.length),...bytes32(data.length),...bytes16(nameBytes.length),0,0]);
    local.push(start,nameBytes,data);
    central.push(new Uint8Array([0x50,0x4b,1,2,20,0,20,0,0,8,0,0,0,0,0,0,...bytes32(crc),...bytes32(data.length),...bytes32(data.length),...bytes16(nameBytes.length),0,0,0,0,0,0,0,0,0,0,0,0,...bytes32(offset)]),nameBytes);
    offset+=start.length+nameBytes.length+data.length;
  }
  const centralSize=central.reduce((sum,x)=>sum+x.length,0),count=Object.keys(files).length;
  const end=new Uint8Array([0x50,0x4b,5,6,0,0,0,0,...bytes16(count),...bytes16(count),...bytes32(centralSize),...bytes32(offset),0,0]);
  return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
/**
 * @param {Array<object>} records - Dữ liệu ĐÃ được validateSavedEntries từ measurement-core.
 * @param {object} session - Chỉ lấy dữ liệu phiên hiện tại, không tự gán MSSV/họ tên.
 */
export function buildMeasurementWorkbook(records,session={}){
  records=validateSavedEntries(records);
  if(!records.length)throw new Error('NO_VALID_MEASUREMENTS');
  const labels=['Tên linh kiện','Trị số danh định','Dung sai cho phép','Thực tế đo được','Trạng thái linh kiện','Kết luận chất lượng','Giá trị số','Đơn vị','Thang đo','Ghi lúc'];
  const info=[['LAB THỰC HÀNH – BẢNG SỐ LIỆU 1.1'],['Bài','Bài 1 – Phần 1: Đo kiểm tra linh kiện thụ động'],['Mã phiên',session.sessionId||'Chưa có'],['Thời điểm xuất',new Date().toISOString()],['Nguồn dữ liệu','Mô phỏng, chưa xác nhận điểm từ giảng viên'],['Họ tên',session.fullName||'Chưa liên kết tài khoản'],['MSSV',session.studentCode||'Chưa liên kết tài khoản'],['Lớp',session.className||'Chờ xác nhận'],['Thời gian thực hành (giây)',Number.isFinite(session.activeMs)?Math.round(session.activeMs/1000):'Chưa ghi nhận'],['Tiến độ',`${records.length}/18`],['Tiến độ (%)',Math.round(records.length/18*100)],['Lượt trợ giúp',Number.isInteger(session.helpCount)?session.helpCount:'Chưa ghi nhận']];
  const rows=[['BẢNG 1.1 – KẾT QUẢ ĐO'],['Chỉ ghi các phép đo đã được bộ đo xác nhận hợp lệ'],labels];
  for(const entry of records){
    if(!entry||!Array.isArray(entry.columns)||entry.columns.length!==6)continue;
    rows.push([...entry.columns,entry.value??'',entry.unit,entry.mode,entry.recordedAt]);
  }
  const types=`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const book=`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Thông tin" sheetId="1" r:id="rId1"/><sheet name="Bảng 1.1" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const bookRels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
  return zip({'[Content_Types].xml':types,'_rels/.rels':rels,'xl/workbook.xml':book,'xl/_rels/workbook.xml.rels':bookRels,'xl/worksheets/sheet1.xml':sheet(info),'xl/worksheets/sheet2.xml':sheet(rows,2)});
}

/** Xuất báo cáo lớp do admin đã tải trong bộ nhớ. Không gọi mạng; dữ liệu chỉ ở máy đang dùng. */
export function buildTableWorkbook(rows,title='Báo cáo thực hành',context={}) {
  if(!Array.isArray(rows)||rows.length<2||!rows.slice(1).some(row=>Array.isArray(row)&&row.some(value=>String(value??'').trim())))throw new Error('NO_REPORT_DATA');
  if(rows.length>1000||rows.some(row=>!Array.isArray(row)||row.length>24))throw new Error('REPORT_TOO_LARGE');
  const safeRows=rows.map(row=>row.map(value=>typeof value==='number'&&Number.isFinite(value)?value:String(value??'')));
  const info=[['LAB THỰC HÀNH – BỘ MÔN VẬT LÝ CÔNG NGHỆ'],['Tên báo cáo',title],['Xuất lúc',new Date().toISOString()],['Nguồn dữ liệu',context.sourceDescription||'Chỉ những hồ sơ hiện đã được admin tải'],['Lưu ý',context.note||'Số phiên chưa được chứng minh 3D nếu thiếu minh chứng được duyệt']];
  const contents=`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const book=`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Thông tin" sheetId="1" r:id="rId1"/><sheet name="Dữ liệu" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const bookRels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
  return zip({'[Content_Types].xml':contents,'_rels/.rels':rels,'xl/workbook.xml':book,'xl/_rels/workbook.xml.rels':bookRels,'xl/worksheets/sheet1.xml':sheet(info),'xl/worksheets/sheet2.xml':sheet(safeRows)});
}

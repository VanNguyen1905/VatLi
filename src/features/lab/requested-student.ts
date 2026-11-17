type ExistingStudent={studentCode:string;className:string;enrollmentStatus?:string};
/** Prepare only: never creates Auth accounts or writes a roster document. */
export function prepareRequestedStudent(students:ExistingStudent[]){
  const code='DEMO21201';
  if(students.some(s=>s.studentCode.toUpperCase()===code))return {ready:false as const,reason:'MSSV DEMO21201 đã tồn tại; giữ nguyên hồ sơ cũ.'};
  const codes=students.map(s=>s.studentCode.toUpperCase());
  if(new Set(codes).size!==codes.length)return {ready:false as const,reason:'Danh sách hiện có mã trùng; cần đối soát trước khi bổ sung.'};
  const active=students.filter(s=>s.enrollmentStatus!=='withdrawn'&&s.studentCode.toUpperCase()!=='DEMO21175');
  const groups=new Map<string,number>();active.forEach(s=>groups.set(s.className||'',(groups.get(s.className||'')||0)+1));
  const matches=[...groups].filter(([,count])=>count===46);
  if(matches.length!==1)return {ready:false as const,reason:'Chưa xác định duy nhất nhóm đang có 46 sinh viên từ dữ liệu đã tải.'};
  return {ready:true as const,document:'labRoster/DEMO21201',record:{studentCode:code,fullName:'Sinh viên minh họa',className:matches[0][0],uid:''},activeCountBefore:46,activeCountAfter:47,requiresOwnerApproval:true};
}

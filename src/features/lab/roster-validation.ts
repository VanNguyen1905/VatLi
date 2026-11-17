export type RosterInput={studentCode:string;fullName:string;className:string;uid:string};
export function validateRosterInput(entries:RosterInput[],knownClasses:Set<string>):RosterInput[]{
  if(!entries.length||entries.length>100)throw new Error('Cần từ 1 đến 100 sinh viên');
  const seen=new Set<string>();
  return entries.map(entry=>{
    const studentCode=entry.studentCode.trim().toUpperCase(),fullName=entry.fullName.trim(),className=entry.className.trim(),uid=entry.uid.trim();
    if(!/^[A-Z0-9_-]{2,40}$/.test(studentCode)||studentCode==='DEMO21175')throw new Error('Mã sinh viên không hợp lệ hoặc đã nghỉ học');
    if(seen.has(studentCode))throw new Error(`Mã sinh viên bị trùng: ${studentCode}`);seen.add(studentCode);
    if(fullName.length<2||fullName.length>100)throw new Error('Họ tên phải có 2–100 ký tự');
    if(!className||className.length>80)throw new Error('Thiếu tên lớp: chờ xác nhận trước khi lưu');
    if(!knownClasses.has(className))throw new Error(`Lớp ${className} chưa có trong danh sách lớp hiện tại; cần Owner xác nhận lớp trước`);
    if(uid&&!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw new Error('UID Firebase không hợp lệ');
    return {studentCode,fullName,className,uid};
  });
}

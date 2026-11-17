/** Only return controlled text: provider messages can contain URLs or credentials. */
export function biscotErrorMessage(error:unknown):string {
  const value=error as {code?:unknown;message?:unknown}|null;
  const message=`${typeof value?.code==='string'?value.code:''} ${typeof value?.message==='string'?value.message:''}`.toLowerCase();
  if(message.includes('biscot_appcheck_not_configured'))return 'Thiếu App Check Site Key cho Firebase AI Logic. Hãy kiểm tra cấu hình website.';
  if(/401|unauthenticated|biscot_login_required|id-token-expired|user-token-expired|invalid-user-token|token-expired/.test(message))return 'Phiên đăng nhập AI đã hết hạn hoặc chưa hợp lệ. Hãy đăng nhập lại để tiếp tục.';
  if(/403|app-check|appcheck/.test(message))return 'Firebase App Check chưa xác minh phiên làm việc.';
  if(/permission-denied/.test(message))return 'Tài khoản chưa được cấp quyền truy cập dịch vụ này.';
  if(/429|resource-exhausted|quota/.test(message))return 'Nhà cung cấp AI đang giới hạn lượt sử dụng. Hướng dẫn DMM theo trạng thái vẫn dùng được.';
  if(message.includes('biscot_invalid_question'))return 'Câu hỏi không hợp lệ hoặc quá 900 ký tự.';
  if(message.includes('biscot_empty_response'))return 'AI chưa trả về nội dung. Bạn có thể thử lại câu hỏi.';
  return 'Biscot đang mất kết nối dịch vụ AI. Chế độ chẩn đoán DMM theo trạng thái vẫn có thể sử dụng.';
}

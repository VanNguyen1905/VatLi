/** Quy tắc chấm điểm độc lập với Firebase, kiểm thử bằng Node. */
export function validateReview({result,score,note,minimumScore,hasTrustedMeasurement}) {
  if (!['PASSED','FAILED'].includes(result)) throw new Error('Trạng thái đánh giá không hợp lệ.');
  if (!Number.isInteger(score) || score<0 || score>100) throw new Error('Điểm phải là số nguyên 0–100.');
  if (typeof note !== 'string' || note.trim().length>2000) throw new Error('Nhận xét vượt giới hạn 2000 ký tự.');
  if (result==='PASSED' && !hasTrustedMeasurement) throw new Error('Không có minh chứng đo 3D được backend xác minh. Không thể duyệt đạt.');
  if (result==='PASSED' && score<minimumScore) throw new Error(`Điểm chưa đạt ngưỡng ${minimumScore}.`);
  return {result,score,note:note.trim()};
}

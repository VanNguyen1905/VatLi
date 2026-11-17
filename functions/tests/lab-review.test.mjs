import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateReview} from '../lab-review-core.mjs';
const good={result:'PASSED',score:80,note:'Đạt',minimumScore:70,hasTrustedMeasurement:true};
test('Admin không thể duyệt nếu không có bằng chứng tin cậy',()=>assert.throws(()=>validateReview({...good,hasTrustedMeasurement:false}),/minh chứng/));
test('Không thể duyệt dưới ngưỡng bài nhỏ',()=>assert.throws(()=>validateReview({...good,score:69}),/ngưỡng/));
test('Admin có thể ghi không đạt dù chưa có bằng chứng',()=>assert.equal(validateReview({...good,result:'FAILED',hasTrustedMeasurement:false,score:0}).result,'FAILED'));
test('Dữ liệu điểm và nhận xét được xác thực',()=>{assert.throws(()=>validateReview({...good,score:101}));assert.throws(()=>validateReview({...good,note:'a'.repeat(2001)}));assert.equal(validateReview(good).score,80)});

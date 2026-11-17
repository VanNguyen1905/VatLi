/**
 * LABVIRT — model DMM for the six passive-component training samples.
 *
 * Sample values follow references/Phan1_Bai1_teacher.html (COMP_DB.normalVal).
 * Teacher values correct V5.1's mismatches: R3 219.2 Ω, C1 98.5 nF, C2 96.4 µF.
 * These are explicit idealised model parameters, not readings from real hardware,
 * Blender geometry, a general circuit solver, or a source of verified assessment.
 * A 10 mH inductor is inspected here by its 12.4 ohm winding resistance only.
 */
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const COMPONENTS = freeze({
  R1: {name: 'Điện trở R1', nominal: '1 kΩ', nominalValue: 1000, tolerance: 5,
    type: 'RES', value: 996, unit: 'Ω', quantity: 'RESISTANCE',
    description: 'Nâu – Đen – Đỏ – Nhũ vàng; mẫu mô phỏng 996 Ω.'},
  R2: {name: 'Điện trở R2', nominal: '10 kΩ', nominalValue: 10000, tolerance: 5,
    type: 'RES', value: 10120, unit: 'Ω', quantity: 'RESISTANCE',
    description: 'Nâu – Đen – Cam – Nhũ vàng; mẫu mô phỏng 10 120 Ω.'},
  R3: {name: 'Điện trở R3', nominal: '220 Ω', nominalValue: 220, tolerance: 5,
    type: 'RES', value: 219.2, unit: 'Ω', quantity: 'RESISTANCE',
    description: 'Đỏ – Đỏ – Nâu – Nhũ vàng; mẫu giáo trình 219,2 Ω.'},
  C1: {name: 'Tụ gốm C1', nominal: '100 nF', nominalValue: 100, tolerance: 10,
    type: 'CAP', value: 98.5, unit: 'nF', quantity: 'CAPACITANCE',
    description: 'Mã 104 = 100 nF; mẫu giáo trình 98,5 nF.'},
  C2: {name: 'Tụ hóa C2', nominal: '100 µF', nominalValue: 100, tolerance: 20,
    type: 'CAP', value: 96.4, unit: 'µF', quantity: 'CAPACITANCE',
    description: 'Tụ phân cực 100 µF / 25 V; mẫu giáo trình 96,4 µF.'},
  L: {name: 'Cuộn cảm L', nominal: '10 mH', nominalValue: 10, tolerance: 10,
    type: 'IND', value: 12.4, unit: 'Ω', quantity: 'WINDING_RESISTANCE',
    description: 'Rdc cuộn dây = 12,4 Ω trong mô hình; DMM này không đo điện cảm 10 mH.'},
});

export const MEASUREMENT_POLICY = freeze({
  model: 'TEACHER_PASSIVE_REFERENCE_SAMPLES', version: 1,
  reference: 'references/Phan1_Bai1_teacher.html',
  shortResistanceOhm: 0.01, continuityThresholdOhm: 50,
  resistorNormalMode: 'OHM', capacitorNormalMode: 'CAP', capacitorOpenMode: 'CAP',
  capacitorShortModes: ['OHM', 'CONT'],
  note: 'Số đo là kết quả mô hình mẫu, chưa phải phép đo thật hoặc minh chứng backend.',
});

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const MODES = ['OFF', 'OHM', 'CONT', 'CAP'];
const DEFECTS = ['NORMAL', 'SHORT', 'OPEN'];
const JACKS = ['NONE', 'COM', 'VOHM', 'AMP', 'MA', 'A'];
const PINS = [null, 'PIN_A', 'PIN_B'];
const labels = {NORMAL: 'SỐNG', SHORT: 'CHẠM', OPEN: 'ĐỨT'};
const badKeys = ['__proto__', 'constructor', 'prototype'];

function plain(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && !badKeys.some(key => own(value, key)));
}

function normalizeInput(input) {
  if (!plain(input) || !own(COMPONENTS, input.component)
    || !DEFECTS.includes(input.defect) || !MODES.includes(input.mode)) return null;
  for (const flag of ['powered', 'capacitorCharged', 'ready', 'boardMounted']) {
    if (input[flag] !== undefined && typeof input[flag] !== 'boolean') return null;
  }
  const redJack = input.redJack ?? 'NONE';
  const blackJack = input.blackJack ?? 'NONE';
  const red = input.red ?? null;
  const black = input.black ?? null;
  if (!JACKS.includes(redJack) || !JACKS.includes(blackJack)
    || !PINS.includes(red) || !PINS.includes(black)) return null;
  const redComponent = input.redComponent ?? input.component;
  const blackComponent = input.blackComponent ?? input.component;
  if (typeof redComponent !== 'string' || typeof blackComponent !== 'string') return null;
  return {
    component: input.component, defect: input.defect, mode: input.mode,
    redJack, blackJack, red, black, redComponent, blackComponent,
    powered: input.powered ?? false,
    capacitorCharged: input.capacitorCharged ?? false,
    ready: input.ready ?? true,
    boardMounted: input.boardMounted ?? true,
  };
}

function invalid(reason, status, display = '—') {
  return {valid: false, display, status, unit: '', value: null,
    quantity: 'NONE', reason, beep: false, conclusion: 'Chưa đủ điều kiện kết luận.'};
}

function good(display, status, value, unit, quantity, reason, conclusion, beep = false) {
  return {valid: true, display, status, value, unit, quantity, reason, beep, conclusion};
}

function resistanceDisplay(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(3)} kΩ` : `${value.toFixed(1)} Ω`;
}

/** One source for both the actual model LCD and the expanded meter panel. */
export function evaluateMeasurement(input) {
  const s = normalizeInput(input);
  if (!s) return invalid('INVALID_INPUT', 'CẤU HÌNH KHÔNG HỢP LỆ', '—');
  const component = COMPONENTS[s.component];
  if (s.mode === 'OFF') return invalid('POWER_OFF', 'DMM ĐANG TẮT', 'OFF');
  if (!s.ready) return invalid('SCENE_NOT_READY', 'CHƯA TẢI THIẾT BỊ 3D', '—');
  if (!s.boardMounted) return invalid('NOT_ON_BREADBOARD', 'ĐẶT LINH KIỆN LÊN BREADBOARD', '—');
  if (s.powered) return invalid('LIVE_CIRCUIT', 'NGẮT NGUỒN TRƯỚC KHI ĐO', '—');
  if (component.type === 'CAP' && s.capacitorCharged) {
    return invalid('CHARGED_CAPACITOR', 'XẢ TỤ TRƯỚC KHI ĐO', '—');
  }
  if (s.redJack === 'NONE' || s.blackJack === 'NONE') {
    return invalid('MISSING_JACK', 'CHƯA CẮM ĐỦ JACK', '—');
  }
  if (s.redJack !== 'VOHM' || s.blackJack !== 'COM') {
    return invalid('WRONG_JACK', 'ĐEN → COM; ĐỎ → VΩ');
  }
  if (!s.red || !s.black) return invalid('MISSING_CONTACT', 'CHƯA ĐỦ TIẾP XÚC', '—');
  if (s.redComponent !== s.component || s.blackComponent !== s.component) {
    return invalid('DIFFERENT_COMPONENTS', 'HAI QUE PHẢI CHẠM CÙNG LINH KIỆN');
  }
  if (s.red === s.black) return invalid('SAME_PIN', 'HAI QUE CÙNG MỘT ĐẦU', '—');

  // Each defect changes the electrical model, not the validation of probe actions.
  // The displayed reading follows that model only after all connections are valid.
  if (s.defect === 'SHORT') {
    if (!['OHM', 'CONT'].includes(s.mode)) {
      return invalid('SHORT_REQUIRES_OHM', 'NGẮN MẠCH: KIỂM TRA BẰNG Ω / THÔNG MẠCH');
    }
    const resistance = MEASUREMENT_POLICY.shortResistanceOhm;
    return good(`${resistance.toFixed(2)} Ω`, s.mode === 'CONT' ? 'BEEP · NGẮN MẠCH' : 'ĐIỆN TRỞ GẦN 0',
      resistance, 'Ω', 'RESISTANCE', 'SHORT_CIRCUIT', 'Hỏng: ngắn mạch, không đạt chất lượng.', s.mode === 'CONT');
  }
  if (s.defect === 'OPEN') {
    if (component.type === 'CAP' ? s.mode !== 'CAP' : !['OHM', 'CONT'].includes(s.mode)) {
      return invalid('OPEN_WRONG_MODE', component.type === 'CAP'
        ? 'TỤ HỞ: DÙNG THANG C; Ω KHÔNG ĐỦ KẾT LUẬN' : 'HỞ MẠCH: DÙNG Ω / THÔNG MẠCH');
    }
    return good('O.L', 'HỞ MẠCH', null, component.type === 'CAP' ? component.unit : 'Ω',
      component.quantity, 'OPEN_CIRCUIT', 'Hỏng: hở mạch trong mô hình, không đạt chất lượng.');
  }

  if (component.type === 'CAP') {
    if (s.mode !== 'CAP') return invalid('CAP_REQUIRES_CAP', 'ĐO ĐIỆN DUNG: CHỌN THANG C');
    const deviation = Math.abs(component.value - component.nominalValue) / component.nominalValue * 100;
    const inTolerance = deviation <= component.tolerance;
    return good(`${component.value.toFixed(1)} ${component.unit}`, 'ĐIỆN DUNG', component.value, component.unit,
      'CAPACITANCE', 'CAPACITANCE_MEASURED', inTolerance
        ? `Đạt dung sai điện dung (lệch ${deviation.toFixed(1)}%).`
        : `Không đạt dung sai điện dung (lệch ${deviation.toFixed(1)}%).`);
  }
  if (component.type === 'IND') {
    if (!['OHM', 'CONT'].includes(s.mode)) return invalid('INDUCTOR_REQUIRES_OHM', 'ĐO Rdc CUỘN DÂY: CHỌN Ω');
    return good(resistanceDisplay(component.value), s.mode === 'CONT' ? 'BEEP · CUỘN DÂY THÔNG' : 'Rdc CUỘN DÂY',
      component.value, 'Ω', 'WINDING_RESISTANCE', 'WINDING_MEASURED',
      'Cuộn dây thông; chỉ kiểm tra Rdc, chưa xác minh điện cảm 10 mH.',
      s.mode === 'CONT' && component.value < MEASUREMENT_POLICY.continuityThresholdOhm);
  }
  if (s.mode !== 'OHM') {
    return invalid('RESISTOR_REQUIRES_OHM', 'ĐO TRỊ SỐ ĐIỆN TRỞ: CHỌN Ω', '—');
  }
  const deviation = Math.abs(component.value - component.nominalValue) / component.nominalValue * 100;
  return good(resistanceDisplay(component.value), 'ĐIỆN TRỞ', component.value, 'Ω', 'RESISTANCE',
    'RESISTANCE_MEASURED', deviation <= component.tolerance
      ? `Đạt dung sai điện trở (lệch ${deviation.toFixed(1)}%).`
      : `Không đạt dung sai điện trở (lệch ${deviation.toFixed(1)}%).`);
}

const resultKeys = ['valid', 'display', 'status', 'value', 'unit', 'quantity', 'reason', 'beep', 'conclusion'];

/** Invalid or stale measurements cannot be turned into a saved row by a caller. */
export function createMeasurementRecord(input, result, recordedAt = new Date().toISOString()) {
  const configuration = normalizeInput(input);
  const evaluated = evaluateMeasurement(input);
  if (!evaluated.valid) throw new Error(`INVALID_MEASUREMENT:${evaluated.reason}`);
  if (result && resultKeys.some(key => result[key] !== evaluated[key])) {
    throw new Error('STALE_OR_FORGED_MEASUREMENT');
  }
  if (typeof recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recordedAt)
    || !Number.isFinite(Date.parse(recordedAt)) || new Date(recordedAt).toISOString() !== recordedAt) {
    throw new Error('INVALID_RECORD_TIMESTAMP');
  }
  const component = COMPONENTS[configuration.component];
  const tolerance = component.type === 'IND'
    ? `L ±${component.tolerance}%; không suy ra dung sai L từ Rdc`
    : `±${component.tolerance}%`;
  const record = {
    schemaVersion: 1, key: `${configuration.component}:${configuration.defect}`,
    component: configuration.component, defect: configuration.defect, mode: configuration.mode,
    componentName: component.name, nominal: component.nominal, tolerance,
    lcd: evaluated.display, status: evaluated.conclusion,
    value: evaluated.value, unit: evaluated.unit, quantity: evaluated.quantity,
    stateLabel: labels[configuration.defect], conclusion: evaluated.conclusion,
    recordedAt, configuration,
    columns: [component.name, component.nominal, tolerance, evaluated.display,
      labels[configuration.defect], evaluated.conclusion],
  };
  return record;
}

const sameRecord = (actual, expected) => {
  if (!plain(actual) || Object.keys(actual).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([key, value]) => {
    if (!own(actual, key)) return false;
    if (key === 'configuration') {
      return plain(actual[key]) && Object.keys(actual[key]).length === Object.keys(value).length
        && Object.entries(value).every(([field, expectedValue]) => own(actual[key], field) && actual[key][field] === expectedValue);
    }
    if (key === 'columns') return Array.isArray(actual[key]) && actual[key].length === value.length
      && value.every((cell, index) => actual[key][index] === cell);
    return actual[key] === value;
  });
};

/**
 * Local storage is untrusted. Recompute every row; reject old rows without probe
 * configuration, modified readings, unsafe keys and invalid/stale model versions.
 * This is UI consistency only: local rows remain editable and are not assessment.
 */
export function validateSavedEntries(rows) {
  if (!Array.isArray(rows)) return [];
  const records = new Map();
  for (const row of rows.slice(-1000)) {
    if (!plain(row) || row.schemaVersion !== 1 || !plain(row.configuration)) continue;
    try {
      const expected = createMeasurementRecord(row.configuration, undefined, row.recordedAt);
      if (!sameRecord(row, expected)) continue;
      records.delete(expected.key);
      records.set(expected.key, expected);
    } catch { /* A corrupted local row never prevents opening the lesson. */ }
  }
  return [...records.values()];
}

export function upsertMeasurementRecord(entries, record) {
  return validateSavedEntries([...(Array.isArray(entries) ? entries : []), record]);
}

export function toMeasurementCsv(entries) {
  const header = ['Tên linh kiện', 'Trị số danh định', 'Dung sai cho phép', 'Thực tế đo được', 'Trạng thái linh kiện', 'Kết luận chất lượng'];
  const quote = value => `"${String(value).replace(/"/g, '""')}"`;
  return '\uFEFF' + [header, ...validateSavedEntries(entries).map(row => row.columns)]
    .map(row => row.map(quote).join(',')).join('\r\n');
}

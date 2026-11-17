// Mô hình dữ liệu phòng thí nghiệm. Không chứa kết quả đo giả lập.
export type PracticalStatus = 'draft' | 'published';
export type LabSessionStatus = 'PREPARATION' | 'IN_PROGRESS' | 'SUBMITTED' | 'PASSED' | 'FAILED';
export type LabReadiness = 'NOT_BUILT' | 'INTEGRATION' | 'VERIFIED';
export type ScenarioCategory = 'NORMAL' | 'METER' | 'WIRING' | 'FAULT' | 'SAFETY' | 'PARAMETER';
export interface LabScenario {
  id: string;
  category: ScenarioCategory;
  title: string;
  trigger: string;
  expectedOutcome: string;
  blocking: boolean;
}
export interface EquipmentRequirement {
  id: string;
  name: string;
  quantity: number;
  specification: string;
}
export interface MeasurementField {
  id: string;
  label: string;
  unit: string;
  description: string;
}


export interface Practical {
  id: string;
  title: string;
  objective: string;
  durationMinutes: number;
  instructions: string[];
  requiredEvidence: string[];
  /** Dụng cụ phải có cả mẫu 3D, thông số và tương tác khi triển khai engine. */
  equipment?: EquipmentRequirement[];
  safetyChecks?: string[];
  scenarios?: LabScenario[];
  measurementFields?: MeasurementField[];
  sourcePages?: number[];
  minimumScore: number;
  labReadiness: LabReadiness;
  deadline?: string; // YYYY-MM-DD, optional; chưa có hạn thì không kết luận quá hạn
}
export interface Experiment {
  revision?: number;
  archived?: boolean;
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  published: boolean;
  order: number;
  practicals: Practical[];
  updatedAt?: unknown;
}
export interface LabSession {
  id: string;
  uid: string;
  experimentId: string;
  practicalId: string;
  startedAt: unknown;
  status: LabSessionStatus;
  // Chỉ Admin hoặc backend tin cậy được ghi nhận kết quả cuối cùng.
  score?: number;
  reviewedAt?: unknown;
  reviewRevision?: number;
  reviewedBy?: string;
  reviewNote?: string;
  evidenceCount?: number;
  verified3D?: boolean;
}
export interface RosterStudent {
  revision?: number;
  updatedAt?: unknown;
  id: string;
  studentCode: string;
  fullName: string;
  className: string;
  uid: string;
  enrollmentStatus?: 'active' | 'withdrawn';
  createdAt?: unknown;
}
export type LabEvidenceKind = 'WEB_PREPARATION' | 'UNITY_READY' | 'DEVICE_OPERATION' | 'MEASUREMENT' | 'CIRCUIT_SUBMISSION';
export interface LabEvidence {
  kind: LabEvidenceKind;
  sessionId: string;
  recordedAt: unknown;
  verified: boolean;
  source: 'WEB' | 'UNITY_CLIENT' | 'TRUSTED_BACKEND';
  detail?: string;
}
export function canCountAs3DProof(e: LabEvidence): boolean {
  return e.source === 'TRUSTED_BACKEND' && e.verified && (e.kind === 'MEASUREMENT' || e.kind === 'CIRCUIT_SUBMISSION');
}
export function progressOf(experiment: Experiment, sessions: LabSession[]) {
  const passed = new Set(sessions.filter(s => s.experimentId === experiment.id && s.status === 'PASSED').map(s => s.practicalId));
  return {done: passed.size, total: experiment.practicals.length};
}

export type NormalizedAllotmentStatus =
  | 'PENDING'
  | 'CHECKING'
  | 'ALLOTTED'
  | 'PARTIALLY_ALLOTTED'
  | 'NOT_ALLOTTED'
  | 'NO_RECORD'
  | 'UNAVAILABLE'
  | 'ERROR';

export type VerificationMethod = 'AUTOMATED' | 'MANUAL' | 'USER_VERIFIED';

export interface AllotmentRequest {
  applicationId: string;
  userId: string;
  userName: string;
  ipoId: string;
  ipoName: string;
  registrar?: string;
  pan?: string; // Handled securely over TLS/memory only; never logged or written to plain text DB logs
  appliedQuantity: number;
  price?: number;
  forceRefresh?: boolean;
}

export interface AllotmentResult {
  applicationId: string;
  ipoId: string;
  userId: string;
  status: NormalizedAllotmentStatus;
  sharesAllotted: number;
  refundAmount?: number;
  checkedAt: string;
  providerId: string;
  providerName: string;
  verificationMethod: VerificationMethod;
  errorMessage?: string;
}

export interface EngineProgress {
  total: number;
  completed: number;
  currentApplication?: AllotmentRequest;
  currentIpoName?: string;
  results: Map<string, AllotmentResult>;
}

export interface EngineOptions {
  onProgress?: (progress: EngineProgress) => void;
  onResult?: (result: AllotmentResult) => void;
  signal?: AbortSignal;
  saveResultCallback?: (result: AllotmentResult) => Promise<any>;
}

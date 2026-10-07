export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface JobSummary {
  id: string;
  type: string;
  status: JobStatus;
  /** 0 a 1 */
  progress: number;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

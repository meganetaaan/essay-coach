export interface ReviewJob {
  id: string;
  submissionId: string;
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewJobQueue {
  enqueue(input: { submissionId: string }): Promise<ReviewJob>;
  pickNext(): Promise<ReviewJob | undefined>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: Error): Promise<void>;
  list(): Promise<ReviewJob[]>;
}

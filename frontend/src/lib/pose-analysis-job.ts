import { authFetch } from "@/lib/api";

export interface PoseAnalysisResult {
  video_id: string;
  message: string;
  pose_data_path: string;
  processed_frames: number;
  total_frames: number;
}

export interface PoseAnalysisJobCreateResponse {
  job_id: string;
  video_id: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  created_at: string;
}

export interface PoseAnalysisJobStatusResponse {
  job_id: string;
  video_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  result?: PoseAnalysisResult | null;
}

interface WaitPoseAnalysisJobOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function startPoseAnalysisJob(videoId: string): Promise<PoseAnalysisJobCreateResponse> {
  const response = await authFetch(`/video/${videoId}/analyze/pose/jobs`, { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to start pose analysis job");
  }
  return (await response.json()) as PoseAnalysisJobCreateResponse;
}

export async function getPoseAnalysisJobStatus(
  videoId: string,
  jobId: string,
): Promise<PoseAnalysisJobStatusResponse> {
  const response = await authFetch(`/video/${videoId}/analyze/pose/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch pose analysis job status");
  }
  return (await response.json()) as PoseAnalysisJobStatusResponse;
}

export async function waitForPoseAnalysisJob(
  videoId: string,
  jobId: string,
  options: WaitPoseAnalysisJobOptions = {},
): Promise<PoseAnalysisJobStatusResponse> {
  const timeoutMs = Math.max(10_000, options.timeoutMs ?? 900_000);
  const pollIntervalMs = Math.max(800, options.pollIntervalMs ?? 1_500);
  const start = Date.now();

  while (true) {
    const status = await getPoseAnalysisJobStatus(videoId, jobId);
    if (status.status === "completed") {
      return status;
    }
    if (status.status === "failed") {
      throw new Error(status.error || "Pose analysis job failed");
    }
    if (Date.now() - start >= timeoutMs) {
      throw new Error("Pose analysis job timed out");
    }
    await delay(pollIntervalMs);
  }
}

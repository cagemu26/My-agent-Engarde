import { authFetch } from "@/lib/api";
import type { AthleteSlot } from "@/lib/pose-data";

const ANALYSIS_REPORT_CACHE_PREFIX = "analysis_report:";
const LEGACY_ANALYSIS_REPORT_CACHE_PREFIX = "analysis_report:";
const LEGACY_FALLBACK_REPORT_MARKERS = [
  "由于云端响应不稳定，采用了降级报告模板",
  "当前未检测到足够的",
];

export const ANALYSIS_REPORT_UPDATED_EVENT = "analysis-report-updated";

interface EnsureAnalysisReportOptions {
  athleteSlot?: AthleteSlot | null;
  forceRegenerate?: boolean;
  generateIfMissing?: boolean;
}

interface EnsureAnalysisReportAsyncOptions {
  athleteSlot?: AthleteSlot | null;
  forceRegenerate?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AnalysisReportJobCreateResponse {
  job_id: string;
  video_id: string;
  athlete_slot?: AthleteSlot | null;
  status: string;
  created_at: string;
}

export interface AnalysisReportJobStatusResponse<T extends CachedAnalysisReport = CachedAnalysisReport> {
  job_id: string;
  video_id: string;
  athlete_slot?: AthleteSlot | null;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  results: Array<T & { cached?: boolean }>;
}

type CachedAnalysisReport = {
  video_id: string;
  athlete_slot?: AthleteSlot | null;
  updated_at?: string;
  report?: string;
};

function isLegacyFallbackReport(report: unknown): boolean {
  if (!report || typeof report !== "object") {
    return false;
  }
  const reportBody = (report as { report?: unknown }).report;
  if (typeof reportBody !== "string" || !reportBody.trim()) {
    return false;
  }
  return LEGACY_FALLBACK_REPORT_MARKERS.some((marker) => reportBody.includes(marker));
}

export function buildAnalysisReportCacheKey(
  videoId: string,
  athleteSlot?: AthleteSlot | null,
): string {
  const slotKey = athleteSlot ?? "default";
  return `${ANALYSIS_REPORT_CACHE_PREFIX}${videoId}:${slotKey}`;
}

function buildLegacyAnalysisReportCacheKey(videoId: string): string {
  return `${LEGACY_ANALYSIS_REPORT_CACHE_PREFIX}${videoId}`;
}

export function parseAnalysisReportCacheKey(
  key: string,
): { videoId: string; athleteSlot: AthleteSlot | null } | null {
  if (!key.startsWith(ANALYSIS_REPORT_CACHE_PREFIX)) {
    return null;
  }

  const remainder = key.slice(ANALYSIS_REPORT_CACHE_PREFIX.length);
  const parts = remainder.split(":");
  if (!parts[0]) {
    return null;
  }

  if (parts.length === 1) {
    return { videoId: parts[0], athleteSlot: null };
  }

  const slot = parts[1];
  return {
    videoId: parts[0],
    athleteSlot: slot === "left" || slot === "right" ? slot : null,
  };
}

export function readCachedAnalysisReport<T>(
  videoId: string,
  athleteSlot?: AthleteSlot | null,
): T | null {
  if (typeof window === "undefined" || !videoId) {
    return null;
  }

  try {
    const scopedKey = buildAnalysisReportCacheKey(videoId, athleteSlot);
    const scopedRaw = window.localStorage.getItem(scopedKey);
    if (scopedRaw) {
      const parsedScoped = JSON.parse(scopedRaw) as T;
      if (isLegacyFallbackReport(parsedScoped)) {
        window.localStorage.removeItem(scopedKey);
      } else {
        return parsedScoped;
      }
    }

    const legacyRaw = window.localStorage.getItem(buildLegacyAnalysisReportCacheKey(videoId));
    if (!legacyRaw) {
      return null;
    }
    const parsedLegacy = JSON.parse(legacyRaw) as T;
    if (isLegacyFallbackReport(parsedLegacy)) {
      window.localStorage.removeItem(buildLegacyAnalysisReportCacheKey(videoId));
      return null;
    }
    return parsedLegacy;
  } catch {
    return null;
  }
}

export function writeCachedAnalysisReport<T extends CachedAnalysisReport>(report: T | null | undefined): void {
  if (typeof window === "undefined" || !report?.video_id) {
    return;
  }

  try {
    const cacheKey = buildAnalysisReportCacheKey(report.video_id, report.athlete_slot ?? null);
    window.localStorage.setItem(cacheKey, JSON.stringify(report));
    window.dispatchEvent(
      new CustomEvent(ANALYSIS_REPORT_UPDATED_EVENT, {
        detail: {
          videoId: report.video_id,
          athleteSlot: report.athlete_slot ?? null,
          report,
        },
      }),
    );
  } catch {
    // Ignore storage failures.
  }
}

export function clearCachedAnalysisReports(videoId: string): void {
  if (typeof window === "undefined" || !videoId) {
    return;
  }

  const matchingKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (key === buildLegacyAnalysisReportCacheKey(videoId) || key.startsWith(`${ANALYSIS_REPORT_CACHE_PREFIX}${videoId}:`)) {
      matchingKeys.push(key);
    }
  }

  matchingKeys.forEach((key) => window.localStorage.removeItem(key));
}

export function readCachedAnalysisReportSummary(
  videoId: string,
  athleteSlot?: AthleteSlot | null,
): string {
  const report = readCachedAnalysisReport<{ summary?: string | null }>(videoId, athleteSlot);
  return report?.summary?.trim() ?? "";
}

export async function ensureAnalysisReport<T extends CachedAnalysisReport>(
  videoId: string,
  options: EnsureAnalysisReportOptions = {},
): Promise<T | null> {
  const { athleteSlot = null, forceRegenerate = false, generateIfMissing = true } = options;

  if (!videoId) {
    return null;
  }

  const query = new URLSearchParams();
  if (athleteSlot) {
    query.set("athlete_slot", athleteSlot);
  }
  const basePath = `/video/${videoId}`;
  const querySuffix = query.toString() ? `?${query.toString()}` : "";

  if (forceRegenerate) {
    const regenerateParams = new URLSearchParams(query);
    regenerateParams.set("force_regenerate", "true");
    const regenerateResponse = await authFetch(`${basePath}/analyze/pose/report?${regenerateParams.toString()}`, {
      method: "POST",
    });
    if (!regenerateResponse.ok) {
      throw new Error("Failed to regenerate report");
    }
    const report = (await regenerateResponse.json()) as T;
    writeCachedAnalysisReport(report);
    return report;
  }

  const reportResponse = await authFetch(`${basePath}/analysis-report${querySuffix}`);
  if (reportResponse.ok) {
    const report = (await reportResponse.json()) as T;
    writeCachedAnalysisReport(report);
    return report;
  }

  if (reportResponse.status === 404 && generateIfMissing) {
    const generateResponse = await authFetch(`${basePath}/analyze/pose/report${querySuffix}`, {
      method: "POST",
    });
    if (!generateResponse.ok) {
      throw new Error("Failed to generate report");
    }
    const report = (await generateResponse.json()) as T;
    writeCachedAnalysisReport(report);
    return report;
  }

  if (reportResponse.status === 404) {
    return null;
  }

  throw new Error("Failed to fetch report");
}

export async function startAnalysisReportJob(
  videoId: string,
  options: EnsureAnalysisReportAsyncOptions = {},
): Promise<AnalysisReportJobCreateResponse> {
  const query = new URLSearchParams();
  if (options.athleteSlot) {
    query.set("athlete_slot", options.athleteSlot);
  }
  if (options.forceRegenerate) {
    query.set("force_regenerate", "true");
  }
  const suffix = query.toString();
  const response = await authFetch(
    `/video/${videoId}/analyze/pose/report/jobs${suffix ? `?${suffix}` : ""}`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error("Failed to start analysis report job");
  }
  return (await response.json()) as AnalysisReportJobCreateResponse;
}

export async function getAnalysisReportJobStatus<T extends CachedAnalysisReport = CachedAnalysisReport>(
  videoId: string,
  jobId: string,
): Promise<AnalysisReportJobStatusResponse<T>> {
  const response = await authFetch(`/video/${videoId}/analyze/pose/report/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch analysis report job status");
  }
  return (await response.json()) as AnalysisReportJobStatusResponse<T>;
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function waitForAnalysisReportJob<T extends CachedAnalysisReport = CachedAnalysisReport>(
  videoId: string,
  jobId: string,
  options: EnsureAnalysisReportAsyncOptions = {},
): Promise<AnalysisReportJobStatusResponse<T>> {
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? 180_000);
  const pollIntervalMs = Math.max(500, options.pollIntervalMs ?? 2_000);
  const start = Date.now();

  while (true) {
    const status = await getAnalysisReportJobStatus<T>(videoId, jobId);
    if (status.status === "completed") {
      for (const report of status.results || []) {
        writeCachedAnalysisReport(report);
      }
      return status;
    }
    if (status.status === "failed") {
      throw new Error(status.error || "Analysis report job failed");
    }
    if (Date.now() - start >= timeoutMs) {
      throw new Error("Analysis report job timed out");
    }
    await delay(pollIntervalMs);
  }
}

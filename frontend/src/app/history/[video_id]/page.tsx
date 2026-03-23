"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { authFetch, buildAuthedApiUrl } from "@/lib/api";
import { ReportMarkdown } from "@/components/report-markdown";
import { TopNav } from "@/components/top-nav";

const HISTORY_DETAIL_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

interface VideoMetadata {
  video_id: string;
  title: string;
  athlete: string;
  opponent: string;
  weapon: string;
  match_result: string;
  score: string;
  tournament: string;
  upload_time: string;
}

interface PoseData {
  pose_sequence: Array<{
    frame_index: number;
    landmarks: number[][];
    visibility: number[];
  }>;
  video_properties: {
    width: number;
    height: number;
    fps: number;
    frame_count: number;
  };
}

interface AnalysisReport {
  report_id: string;
  video_id: string;
  report: string;
  summary: string;
  status: string;
  model_name: string;
  prompt_version: string;
  created_at: string;
  updated_at: string;
  cached?: boolean;
}

type ReplayMode = "original" | "skeleton";

export default function VideoDetail() {
  const params = useParams();
  const searchParams = useSearchParams();
  const videoId = params.video_id as string;

  const [video, setVideo] = useState<VideoMetadata | null>(null);
  const [poseData, setPoseData] = useState<PoseData | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [replayMode, setReplayMode] = useState<ReplayMode>("original");
  const [skeletonReady, setSkeletonReady] = useState(false);
  const [skeletonLoading, setSkeletonLoading] = useState(false);
  const [skeletonError, setSkeletonError] = useState<string | null>(null);

  const fetchVideoData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setReportError(null);

      // Fetch video metadata
      const videoResponse = await authFetch(`/video/${videoId}`);
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch video");
      }
      const videoData = await videoResponse.json();
      setVideo(videoData);

      // Fetch pose data (if available)
      try {
        const poseResponse = await authFetch(`/video/${videoId}/pose-data`);
        if (poseResponse.ok) {
          const poseData = await poseResponse.json();
          setPoseData(poseData);
        }
      } catch {
        // Pose data not available
      }

      try {
        const reportResponse = await authFetch(`/video/${videoId}/analysis-report`);
        if (reportResponse.ok) {
          const reportData = (await reportResponse.json()) as AnalysisReport;
          setReport(reportData);
        } else if (reportResponse.status === 404) {
          setReport(null);
        } else {
          setReportError("Failed to fetch report");
        }
      } catch {
        setReport(null);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load video");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    if (videoId) {
      fetchVideoData();
    }
  }, [videoId, fetchVideoData]);

  useEffect(() => {
    const initialView = searchParams.get("view");
    if (initialView === "skeleton") {
      setReplayMode("skeleton");
    } else if (initialView === "replay") {
      setReplayMode("original");
    }
  }, [searchParams]);

  const ensureSkeletonReplay = useCallback(async () => {
    if (skeletonReady || skeletonLoading) {
      return;
    }

    try {
      setSkeletonLoading(true);
      setSkeletonError(null);
      const response = await authFetch(`/video/${videoId}/pose-overlay`);
      if (!response.ok) {
        throw new Error("Failed to prepare skeleton replay");
      }
      await response.json();
      setSkeletonReady(true);
    } catch (err) {
      setSkeletonError(err instanceof Error ? err.message : "Failed to prepare skeleton replay");
    } finally {
      setSkeletonLoading(false);
    }
  }, [skeletonLoading, skeletonReady, videoId]);

  useEffect(() => {
    if (replayMode === "skeleton") {
      void ensureSkeletonReplay();
    }
  }, [ensureSkeletonReplay, replayMode]);

  const generateReport = async () => {
    try {
      setReportLoading(true);
      setReportError(null);
      const regenerateQuery = report ? "?force_regenerate=true" : "";
      const response = await authFetch(`/video/${videoId}/analyze/pose/report${regenerateQuery}`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to generate report");
      }
      const data: AnalysisReport = await response.json();
      setReport(data);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  };

  const getWeaponLabel = (weapon: string) => {
    const labels: Record<string, string> = {
      foil: "Foil",
      epee: "Épée",
      sabre: "Sabre"
    };
    return labels[weapon?.toLowerCase()] || weapon || "Unknown";
  };

  const getWeaponColor = (weapon: string) => {
    const colors: Record<string, string> = {
      foil: "#FF6B35",
      epee: "#8B5CF6",
      sabre: "#06B6D4"
    };
    return colors[weapon?.toLowerCase()] || "#6B7280";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const originalReplayUrl = buildAuthedApiUrl(`/video/${videoId}/file`);
  const skeletonReplayUrl = buildAuthedApiUrl(`/video/${videoId}/pose-overlay/file`);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav activeHref="/history" links={[...HISTORY_DETAIL_NAV_LINKS]} />
        <main className="pt-32 pb-16">
          <div className="max-w-4xl mx-auto px-6">
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-500 text-sm">{error || "Video not found"}</p>
              <Link href="/history" className="mt-2 text-sm text-primary hover:underline inline-block">
                Back to History
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav activeHref="/history" links={[...HISTORY_DETAIL_NAV_LINKS]} />

      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          {/* Back Link */}
          <Link
            href="/history"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to History
          </Link>

          {/* Video Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">{video.title || "Untitled Video"}</h1>
                <div className="flex items-center gap-3">
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: `${getWeaponColor(video.weapon)}20`,
                      color: getWeaponColor(video.weapon)
                    }}
                  >
                    {getWeaponLabel(video.weapon)}
                  </span>
                  {video.tournament && (
                    <span className="text-muted-foreground">{video.tournament}</span>
                  )}
                </div>
              </div>
              {video.match_result && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  video.match_result === "win"
                    ? "bg-green-500/10 text-green-500"
                    : video.match_result === "loss"
                    ? "bg-red-500/10 text-red-500"
                    : "bg-yellow-500/10 text-yellow-500"
                }`}>
                  {video.match_result === "win" ? "Win" : video.match_result === "loss" ? "Loss" : "Draw"}
                </span>
              )}
            </div>

            {/* Match Info */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Athlete</p>
                  <p className="font-medium">{video.athlete || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Opponent</p>
                  <p className="font-medium">{video.opponent || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Score</p>
                  <p className="font-medium">{video.score || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Uploaded</p>
                  <p className="font-medium">{formatDate(video.upload_time)}</p>
                </div>
              </div>
            </div>
          </div>

          <div id="replay" className="mb-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Replay</h2>
                <p className="text-sm text-muted-foreground">Review the original clip or switch to the skeleton overlay replay.</p>
              </div>
              <div className="inline-flex rounded-xl border border-border bg-card p-1">
                <button
                  type="button"
                  onClick={() => setReplayMode("original")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    replayMode === "original" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setReplayMode("skeleton")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    replayMode === "skeleton" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Skeleton
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="aspect-video bg-black">
                {replayMode === "skeleton" && skeletonLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                      <p className="text-sm text-muted-foreground">Preparing skeleton replay...</p>
                    </div>
                  </div>
                ) : replayMode === "skeleton" && skeletonError ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                    <p className="text-sm text-red-500">{skeletonError}</p>
                    <button
                      type="button"
                      onClick={() => void ensureSkeletonReplay()}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Retry Skeleton Replay
                    </button>
                  </div>
                ) : (
                  <video
                    key={replayMode}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full"
                    src={replayMode === "skeleton" ? skeletonReplayUrl : originalReplayUrl}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  {replayMode === "skeleton"
                    ? "Skeleton replay overlays detected pose landmarks on top of the original clip."
                    : "Original replay lets you inspect the source footage before or after comparing the overlay."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={originalReplayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border px-3 py-2 font-medium transition-colors hover:border-primary/40 hover:bg-secondary"
                  >
                    Open Original
                  </a>
                  <a
                    href={buildAuthedApiUrl(`/video/${videoId}/pose-overlay/file`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-secondary px-3 py-2 font-medium transition-colors hover:bg-secondary/80"
                  >
                    Open Skeleton
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Pose Analysis Summary */}
          {poseData && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4">Pose Analysis</h2>
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Frames Processed</p>
                    <p className="text-2xl font-bold">
                      {poseData.video_properties?.frame_count || poseData.pose_sequence?.length || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Video Duration</p>
                    <p className="text-2xl font-bold">
                      {poseData.video_properties?.fps
                        ? `${(poseData.video_properties.frame_count / poseData.video_properties.fps).toFixed(1)}s`
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Resolution</p>
                    <p className="text-2xl font-bold">
                      {poseData.video_properties?.width}x{poseData.video_properties?.height}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">FPS</p>
                    <p className="text-2xl font-bold">
                      {poseData.video_properties?.fps || "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis Report */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">AI Analysis Report</h2>

            {reportError && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-red-500 text-sm">{reportError}</p>
              </div>
            )}

            {report ? (
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2.5 py-1">
                      {report.cached ? "Cached report" : "Saved report"}
                    </span>
                    <span>
                      Updated {new Date(report.updated_at).toLocaleString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {reportLoading && <span>Refreshing report...</span>}
                  </div>
                  {poseData && !reportLoading && (
                    <button
                      onClick={generateReport}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Regenerate Report
                    </button>
                  )}
                </div>
                <ReportMarkdown content={report.report} summary={report.summary} />
              </div>
            ) : poseData ? (
              <div className="p-4 rounded-xl bg-card border border-border">
                {reportLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-muted-foreground text-sm">Generating AI report...</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground mb-4">
                      Generate an AI-powered analysis report based on pose data.
                    </p>
                    <button
                      onClick={generateReport}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Generate Report
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <p className="text-muted-foreground text-sm">
                  No pose data available. Run pose analysis first to generate an AI report.
                </p>
              </div>
            )}
          </div>

          {/* No Data State */}
          {!poseData && (
            <div className="p-6 rounded-xl bg-muted/50 border border-border text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No Analysis Data</h3>
              <p className="text-muted-foreground text-sm mb-4">
                This video has not been analyzed yet. Go to Analyze to run pose detection.
              </p>
              <Link
                href={`/analyze?video=${videoId}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Run Analysis
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

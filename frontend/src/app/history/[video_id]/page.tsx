"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

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

interface FencingMetrics {
  average_lunge_distance: number;
  average_recovery_time: number;
  visibility_score: number;
  dominant_stance: string;
  total_movements: number;
}

interface AnalysisReport {
  report: string;
}

export default function VideoDetail() {
  const params = useParams();
  const videoId = params.video_id as string;

  const [video, setVideo] = useState<VideoMetadata | null>(null);
  const [poseData, setPoseData] = useState<PoseData | null>(null);
  const [metrics, setMetrics] = useState<FencingMetrics | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (videoId) {
      fetchVideoData();
    }
  }, [videoId]);

  const fetchVideoData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch video metadata
      const videoResponse = await fetch(`http://localhost:8000/video/${videoId}`);
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch video");
      }
      const videoData = await videoResponse.json();
      setVideo(videoData);

      // Fetch pose data (if available)
      try {
        const poseResponse = await fetch(`http://localhost:8000/video/${videoId}/pose-data`);
        if (poseResponse.ok) {
          const poseData = await poseResponse.json();
          setPoseData(poseData);
        }
      } catch {
        // Pose data not available
      }

      // Fetch metrics (if available)
      try {
        const metricsResponse = await fetch(`http://localhost:8000/video/${videoId}/pose-metrics`);
        if (metricsResponse.ok) {
          const metricsData = await metricsResponse.json();
          setMetrics(metricsData);
        }
      } catch {
        // Metrics not available
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load video");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      setReportLoading(true);
      const response = await fetch(`http://localhost:8000/video/${videoId}/analyze/pose/report`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to generate report");
      }
      const data: AnalysisReport = await response.json();
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
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
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">E</span>
              </div>
              <span className="font-semibold text-lg">Engarde AI</span>
            </Link>
          </div>
        </nav>
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
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">E</span>
            </div>
            <span className="font-semibold text-lg">Engarde AI</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/analyze" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Analyze
            </Link>
            <Link href="/training" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Training
            </Link>
            <Link href="/history" className="text-sm text-primary font-medium">
              History
            </Link>
          </div>
        </div>
      </nav>

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

          {/* Fencing Metrics */}
          {metrics && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4">Fencing Metrics</h2>
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Lunge Distance</p>
                    <p className="text-xl font-bold">{metrics.average_lunge_distance?.toFixed(2) || 0}m</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Recovery Time</p>
                    <p className="text-xl font-bold">{metrics.average_recovery_time?.toFixed(2) || 0}s</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Visibility Score</p>
                    <p className="text-xl font-bold">{metrics.visibility_score?.toFixed(1) || 0}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Dominant Stance</p>
                    <p className="text-xl font-bold capitalize">{metrics.dominant_stance || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Movements</p>
                    <p className="text-xl font-bold">{metrics.total_movements || 0}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Skeleton Overlay Link */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">Visual Analysis</h2>
            <Link
              href={`/demo?video=${videoId}`}
              className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">View Skeleton Overlay</p>
                  <p className="text-sm text-muted-foreground">Watch video with pose landmarks overlay</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* AI Analysis Report */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">AI Analysis Report</h2>

            {report ? (
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="prose prose-invert max-w-none">
                  <p className="whitespace-pre-wrap text-foreground leading-relaxed">{report}</p>
                </div>
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
                      Generate an AI-powered analysis report based on pose data and metrics.
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
                  No pose data available. Run pose analysis first to generate metrics and AI reports.
                </p>
              </div>
            )}
          </div>

          {/* No Data State */}
          {!poseData && !metrics && (
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

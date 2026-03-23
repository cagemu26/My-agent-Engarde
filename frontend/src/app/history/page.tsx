"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/api";
import { TopNav } from "@/components/top-nav";

const HISTORY_NAV_LINKS = [
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

export default function History() {
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authFetch("/video/list");
      if (!response.ok) {
        throw new Error("Failed to fetch videos");
      }
      const data = await response.json();
      setVideos(data.videos || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const getWeaponLabel = (weapon: string) => {
    const labels: Record<string, string> = {
      foil: "Foil",
      epee: "Épée",
      sabre: "Sabre"
    };
    return labels[weapon?.toLowerCase()] || weapon;
  };

  const getWeaponColor = (weapon: string) => {
    const colors: Record<string, string> = {
      foil: "#F97316",
      epee: "#DC2626",
      sabre: "#06B6D4"
    };
    return colors[weapon?.toLowerCase()] || "#6B7280";
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[80px]"></div>
      </div>

      <TopNav activeHref="/history" links={[...HISTORY_NAV_LINKS]} />

      <main className="pt-32 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-4xl font-bold mb-2">Analysis History</h1>
              <p className="text-muted-foreground">Review your past performances</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Videos</p>
              <p className="text-4xl font-bold gradient-text">{videos.length}</p>
            </div>
          </div>

          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            History is now integrated into <Link href="/analyze" className="font-semibold underline underline-offset-2">Analyze</Link> as a collapsible sidebar for faster browsing.
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground">Loading videos...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-6 p-5 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={fetchVideos}
                className="mt-3 text-sm text-red-600 hover:underline font-medium"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && videos.length === 0 && (
            <div className="text-center py-20 glass-card rounded-3xl">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">No videos yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Upload your first fencing video to start analyzing your technique
              </p>
              <Link
                href="/analyze"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all"
              >
                Upload Video
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          )}

          {/* Filters */}
          {!loading && !error && videos.length > 0 && (
            <>
              {/* History List */}
              <div className="space-y-4">
                {videos.map((video) => (
                  <div
                    key={video.video_id}
                    className="glass-card rounded-2xl p-5 transition-all duration-300 hover-lift"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <Link
                        href={`/history/${video.video_id}`}
                        className="group flex min-w-0 flex-1 items-center justify-between gap-4"
                      >
                        <div className="flex min-w-0 items-center gap-5">
                          <div
                            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-lg"
                            style={{ backgroundColor: `${getWeaponColor(video.weapon)}20` }}
                          >
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={getWeaponColor(video.weapon)} strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold transition-colors group-hover:text-red-600">{video.title || "Untitled Video"}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                  backgroundColor: `${getWeaponColor(video.weapon)}20`,
                                  color: getWeaponColor(video.weapon)
                                }}
                              >
                                {getWeaponLabel(video.weapon)}
                              </span>
                              {video.tournament && (
                                <>
                                  <span>•</span>
                                  <span>{video.tournament}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>{formatDate(video.upload_time)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          {video.match_result && (
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                              video.match_result === "win"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : video.match_result === "loss"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            }`}>
                              {video.match_result === "win" ? "Win" : video.match_result === "loss" ? "Loss" : "Draw"}
                            </span>
                          )}
                          {video.score && (
                            <p className="text-sm font-mono font-semibold text-muted-foreground">
                              {video.score}
                            </p>
                          )}
                          <svg className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Link
                          href={`/history/${video.video_id}?view=replay`}
                          className="rounded-xl border border-border px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                        >
                          Replay
                        </Link>
                        <Link
                          href={`/history/${video.video_id}?view=skeleton`}
                          className="rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-3 py-2 text-center text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-red-500/30"
                        >
                          Skeleton Replay
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

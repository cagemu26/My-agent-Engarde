"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  const [selectedWeapon, setSelectedWeapon] = useState<string>("all");

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:8000/video/list");
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
  };

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

  const filteredVideos = selectedWeapon === "all"
    ? videos
    : videos.filter(v => v.weapon.toLowerCase() === selectedWeapon.toLowerCase());

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[80px]"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform duration-300">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">Engarde</span>
              <span className="font-bold text-xl text-red-600">AI</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/analyze" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Analyze
            </Link>
            <Link href="/training" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Training
            </Link>
            <Link href="/history" className="text-sm font-medium text-red-600 hover-lift">
              History
            </Link>
            <Link href="/demo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Demo
            </Link>
          </div>
        </div>
      </nav>

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
              <div className="flex gap-3 mb-8">
                <button
                  onClick={() => setSelectedWeapon("all")}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${
                    selectedWeapon === "all"
                      ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-500/30"
                      : "bg-card border border-border hover:border-red-300"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedWeapon("foil")}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${
                    selectedWeapon === "foil"
                      ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30"
                      : "bg-card border border-border hover:border-orange-300"
                  }`}
                >
                  Foil
                </button>
                <button
                  onClick={() => setSelectedWeapon("epee")}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${
                    selectedWeapon === "epee"
                      ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-500/30"
                      : "bg-card border border-border hover:border-red-300"
                  }`}
                >
                  Épée
                </button>
                <button
                  onClick={() => setSelectedWeapon("sabre")}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${
                    selectedWeapon === "sabre"
                      ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/30"
                      : "bg-card border border-border hover:border-cyan-300"
                  }`}
                >
                  Sabre
                </button>
              </div>

              {/* History List */}
              <div className="space-y-4">
                {filteredVideos.map((video) => (
                  <Link
                    key={video.video_id}
                    href={`/history/${video.video_id}`}
                    className="block group"
                  >
                    <div className="glass-card p-5 rounded-2xl hover-lift transition-all duration-300 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                          <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                            style={{ backgroundColor: `${getWeaponColor(video.weapon)}20` }}
                          >
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={getWeaponColor(video.weapon)} strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg group-hover:text-red-600 transition-colors">{video.title || "Untitled Video"}</h3>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
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
                        <div className="flex items-center gap-4">
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
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

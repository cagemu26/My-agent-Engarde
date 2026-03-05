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
    return labels[weapon.toLowerCase()] || weapon;
  };

  const getWeaponColor = (weapon: string) => {
    const colors: Record<string, string> = {
      foil: "#FF6B35",
      epee: "#8B5CF6",
      sabre: "#06B6D4"
    };
    return colors[weapon.toLowerCase()] || "#6B7280";
  };

  const filteredVideos = selectedWeapon === "all"
    ? videos
    : videos.filter(v => v.weapon.toLowerCase() === selectedWeapon.toLowerCase());

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
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-1">Analysis History</h1>
              <p className="text-muted-foreground">Review your past performances</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Videos</p>
              <p className="text-3xl font-bold text-primary">{videos.length}</p>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground text-sm">Loading videos...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-500 text-sm">{error}</p>
              <button
                onClick={fetchVideos}
                className="mt-2 text-sm text-red-500 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && videos.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No videos yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Upload your first fencing video to start analyzing
              </p>
              <Link
                href="/analyze"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Upload Video
              </Link>
            </div>
          )}

          {/* Filters */}
          {!loading && !error && videos.length > 0 && (
            <>
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setSelectedWeapon("all")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedWeapon === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border hover:bg-secondary"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedWeapon("foil")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedWeapon === "foil"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border hover:bg-secondary"
                  }`}
                >
                  Foil
                </button>
                <button
                  onClick={() => setSelectedWeapon("epee")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedWeapon === "epee"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border hover:bg-secondary"
                  }`}
                >
                  Épée
                </button>
                <button
                  onClick={() => setSelectedWeapon("sabre")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedWeapon === "sabre"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border hover:bg-secondary"
                  }`}
                >
                  Sabre
                </button>
              </div>

              {/* History List */}
              <div className="space-y-3">
                {filteredVideos.map((video) => (
                  <Link
                    key={video.video_id}
                    href={`/history/${video.video_id}`}
                    className="block"
                  >
                    <div className="p-5 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${getWeaponColor(video.weapon)}20` }}
                          >
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke={getWeaponColor(video.weapon)}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-semibold">{video.title || "Untitled Video"}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-medium"
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
                        <div className="text-right">
                          {video.match_result && (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              video.match_result === "win"
                                ? "bg-green-500/10 text-green-500"
                                : video.match_result === "loss"
                                ? "bg-red-500/10 text-red-500"
                                : "bg-yellow-500/10 text-yellow-500"
                            }`}>
                              {video.match_result === "win" ? "Win" : video.match_result === "loss" ? "Loss" : "Draw"}
                            </span>
                          )}
                          {video.score && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Score: {video.score}
                            </p>
                          )}
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

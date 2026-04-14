"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearCachedAnalysisReports } from "@/lib/analysis-report";
import { authFetch } from "@/lib/api";
import {
  SESSION_META,
  SESSION_TYPE_CHAT,
  SESSION_TYPE_TRAINING,
  SESSION_TYPE_VIDEO,
  type SessionType,
  normalizeSessionType,
} from "@/lib/chat-session";
import { TopNav } from "@/components/top-nav";
import { useAppDialog } from "@/components/app-dialog-provider";
import { useLocale } from "@/lib/locale";

const HISTORY_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/history", label: "History" },
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
  upload_status?: string;
}

interface ChatSessionRecord {
  id: string;
  video_id?: string | null;
  session_type?: SessionType;
  title?: string | null;
  context_summary?: string | null;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  message_count: number;
}

interface ChatSessionDeleteResponse {
  deleted_scope: "session_only" | "video_full";
  deleted_session_count: number;
  deleted_message_count: number;
  video_id?: string | null;
  message: string;
}

const SESSION_ORDER: SessionType[] = [
  SESSION_TYPE_VIDEO,
  SESSION_TYPE_TRAINING,
  SESSION_TYPE_CHAT,
];

const getWeaponLabel = (weapon: string, isZh: boolean) => {
  const labels: Record<string, string> = {
    foil: isZh ? "花剑" : "Foil",
    epee: isZh ? "重剑" : "Epee",
    sabre: isZh ? "佩剑" : "Sabre",
  };
  return labels[weapon?.toLowerCase()] || weapon || (isZh ? "未知" : "Unknown");
};

const formatRelativeTime = (dateString: string | undefined | null, isZh: boolean) => {
  if (!dateString) return isZh ? "未知" : "Unknown";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return isZh ? "未知" : "Unknown";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return isZh ? "刚刚" : "Just now";
  if (diffHours < 24) return isZh ? `${diffHours}小时前` : `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return isZh ? "昨天" : "Yesterday";
  if (diffDays < 7) return isZh ? `${diffDays}天前` : `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return isZh ? `${weeks}周前` : `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  return date.toLocaleDateString();
};

const getSessionTimestamp = (session: ChatSessionRecord) => {
  const value = session.last_message_at || session.updated_at || session.created_at;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const parseApiError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const data = (await response.json()) as { detail?: string; message?: string; error?: string };
    return data.detail || data.message || data.error || fallback;
  } catch {
    return fallback;
  }
};

export default function History() {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const { isZh } = useLocale();
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [sessions, setSessions] = useState<ChatSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const getSessionTypeLabel = useCallback(
    (type: SessionType) => {
      if (type === SESSION_TYPE_VIDEO) return isZh ? "视频分析" : "Video Analysis";
      if (type === SESSION_TYPE_TRAINING) return isZh ? "训练分析" : "Training Analysis";
      return isZh ? "聊天问答" : "Chat Q&A";
    },
    [isZh],
  );

  const fetchHistoryData = useCallback(async () => {
    try {
      setLoading(true);
      const [videosResponse, sessionsResponse] = await Promise.all([
        authFetch("/video/list"),
        authFetch("/chat/sessions?limit=100"),
      ]);
      if (!videosResponse.ok) {
        throw new Error(isZh ? "获取视频失败" : "Failed to fetch videos");
      }
      if (!sessionsResponse.ok) {
        throw new Error(isZh ? "获取会话失败" : "Failed to fetch chat sessions");
      }

      const videosData = await videosResponse.json();
      const sessionsData = await sessionsResponse.json();
      const videos = Array.isArray(videosData.videos) ? (videosData.videos as VideoMetadata[]) : [];
      setVideos(
        videos.filter((item) => {
          const status = (item.upload_status || "").trim().toLowerCase();
          return !status || status === "uploaded";
        }),
      );
      setSessions((sessionsData.sessions || []) as ChatSessionRecord[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "加载历史记录失败" : "Failed to load history data");
    } finally {
      setLoading(false);
    }
  }, [isZh]);

  useEffect(() => {
    fetchHistoryData();
  }, [fetchHistoryData]);

  const videoById = useMemo(() => {
    const map = new Map<string, VideoMetadata>();
    for (const video of videos) {
      map.set(video.video_id, video);
    }
    return map;
  }, [videos]);

  const groupedSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a));
    const groups: Record<SessionType, ChatSessionRecord[]> = {
      [SESSION_TYPE_VIDEO]: [],
      [SESSION_TYPE_TRAINING]: [],
      [SESSION_TYPE_CHAT]: [],
    };

    for (const session of sorted) {
      const type = normalizeSessionType(session.session_type);
      groups[type].push(session);
    }

    return groups;
  }, [sessions]);

  const totalSessions = sessions.length;

  const handleCreateNewSession = useCallback(async () => {
    try {
      setCreatingSession(true);
      const response = await authFetch("/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: SESSION_TYPE_CHAT,
          force_new: true,
          title: `${isZh ? "聊天" : "Chat"} ${new Date().toLocaleDateString()}`,
        }),
      });
      if (!response.ok) {
        throw new Error(isZh ? "创建会话失败" : "Failed to create session");
      }
      const data = (await response.json()) as ChatSessionRecord;
      if (!data.id) {
        throw new Error(isZh ? "会话响应无效" : "Invalid session response");
      }
      router.push(`/analyze?chat_session=${encodeURIComponent(data.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "创建新会话失败" : "Failed to create new session");
    } finally {
      setCreatingSession(false);
    }
  }, [isZh, router]);

  const handleDeleteSession = useCallback(
    async (session: ChatSessionRecord) => {
      if (!session.id || deletingSessionId === session.id) return;

      const normalizedType = normalizeSessionType(session.session_type);
      const isVideoSession = normalizedType === SESSION_TYPE_VIDEO && Boolean(session.video_id);

      const confirmed = await confirm({
        title: isVideoSession
          ? isZh
            ? "删除该视频会话？"
            : "Delete this video session?"
          : isZh
            ? "删除该会话？"
            : "Delete this session?",
        description: isVideoSession
          ? isZh
            ? "将永久删除该视频相关的所有分析会话、消息、视频文件和报告，且无法恢复。"
            : "This will permanently delete all related video-analysis sessions, messages, video assets, and reports for this video. This action cannot be undone."
          : isZh
            ? "将永久删除该会话及全部消息，且无法恢复。"
            : "This will permanently delete this session and all messages. This action cannot be undone.",
        confirmText: isZh ? "删除" : "Delete",
        cancelText: isZh ? "取消" : "Cancel",
        danger: true,
      });
      if (!confirmed) {
        return;
      }

      setDeletingSessionId(session.id);
      try {
        const response = await authFetch(`/chat/sessions/${encodeURIComponent(session.id)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, isZh ? "删除会话失败" : "Failed to delete session"));
        }

        const deleted = (await response.json()) as ChatSessionDeleteResponse;
        const deletedVideoId = deleted.video_id || null;

        if (deletedVideoId && typeof window !== "undefined") {
          clearCachedAnalysisReports(deletedVideoId);
          window.localStorage.removeItem(`video_qa_session:${deletedVideoId}`);
        }

        if (deleted.deleted_scope === "video_full" && deletedVideoId) {
          setSessions((prev) =>
            prev.filter(
              (item) =>
                !(
                  normalizeSessionType(item.session_type) === SESSION_TYPE_VIDEO &&
                  item.video_id === deletedVideoId
                ),
            ),
          );
          setVideos((prev) => prev.filter((video) => video.video_id !== deletedVideoId));
        } else {
          setSessions((prev) => prev.filter((item) => item.id !== session.id));
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : isZh ? "删除会话失败" : "Failed to delete session");
      } finally {
        setDeletingSessionId(null);
      }
    },
    [confirm, deletingSessionId, isZh],
  );

  return (
    <div className="min-h-screen bg-background">
      <TopNav activeHref="/history" links={[...HISTORY_NAV_LINKS]} />

      <main className="pt-32 pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">{isZh ? "会话历史" : "Session History"}</h1>
              <p className="mt-2 text-muted-foreground">
                {isZh ? "按来源类型分组的 AI 多线程会话。" : "Multi-thread AI sessions grouped by source type."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{isZh ? "会话数" : "Threads"}</p>
                <p className="text-4xl font-bold text-foreground">{totalSessions}</p>
              </div>
              <button
                type="button"
                onClick={handleCreateNewSession}
                disabled={creatingSession}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingSession ? (isZh ? "创建中..." : "Creating...") : isZh ? "新建会话" : "New Session"}
              </button>
            </div>
          </div>

          <div className="mb-8 rounded-2xl border border-border bg-card p-4 text-sm text-foreground/85">
            {isZh
              ? "历史记录分为三类：视频分析、训练分析和聊天问答。"
              : "History is grouped into three sources: Video Analysis, Training Analysis, and Chat Q&A."}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
                <p className="text-muted-foreground">{isZh ? "加载历史记录中..." : "Loading history..."}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={fetchHistoryData}
                className="mt-3 text-sm font-medium text-red-600 hover:underline"
              >
                {isZh ? "重试" : "Try again"}
              </button>
            </div>
          )}

          {!loading && !error && totalSessions === 0 && (
            <div className="glass-card py-20 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary">
                <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M12 3C7.03 3 3 6.58 3 11c0 2.2 1 4.19 2.62 5.63L5 21l4.58-2.29c.76.19 1.58.29 2.42.29 4.97 0 9-3.58 9-8s-4.03-8-9-8z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold">{isZh ? "暂无会话" : "No sessions yet"}</h3>
              <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
                {isZh
                  ? "新建聊天会话，或先完成训练/视频分析后在这里查看历史。"
                  : "Start a new chat thread or analyze a training/video context to populate history."}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleCreateNewSession}
                  className="rounded-xl bg-red-600 px-6 py-3 font-medium text-white transition-colors hover:bg-red-700"
                >
                  {isZh ? "新建聊天会话" : "New Chat Session"}
                </button>
                <Link
                  href="/analyze"
                  className="rounded-xl border border-border px-6 py-3 font-medium transition-colors hover:border-red-300"
                >
                  {isZh ? "打开分析页" : "Open Analyze"}
                </Link>
              </div>
            </div>
          )}

          {!loading && !error && totalSessions > 0 && (
            <div className="space-y-8">
              {SESSION_ORDER.map((type) => {
                const items = groupedSessions[type];
                if (!items.length) return null;

                const meta = SESSION_META[type];
                const typeLabel = getSessionTypeLabel(type);
                return (
                  <section key={type}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                        <h2 className="text-lg font-semibold">{typeLabel}</h2>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {isZh ? `${items.length} 个会话` : `${items.length} sessions`}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {items.map((session) => {
                        const linkedVideo = session.video_id ? videoById.get(session.video_id) : null;
                        const normalizedType = normalizeSessionType(session.session_type);
                        const badgeLabel = getSessionTypeLabel(normalizedType);
                        const title =
                          linkedVideo?.title ||
                          session.title ||
                          (type === SESSION_TYPE_VIDEO
                            ? isZh
                              ? "视频分析会话"
                              : "Video Analysis Session"
                            : type === SESSION_TYPE_TRAINING
                              ? isZh
                                ? "训练分析会话"
                                : "Training Analysis Session"
                              : isZh
                                ? "聊天会话"
                                : "Chat Session");

                        const summary =
                          type === SESSION_TYPE_VIDEO
                            ? [
                                linkedVideo?.weapon ? getWeaponLabel(linkedVideo.weapon, isZh) : "",
                                linkedVideo?.tournament || "",
                                linkedVideo?.score || "",
                              ]
                                .filter(Boolean)
                                .join(" • ") || (isZh ? "视频上下文会话" : "Video context session")
                            : session.context_summary?.replace(/\s+/g, " ").trim() || (isZh ? "暂无摘要" : "No summary yet.");

                        return (
                          <div
                            key={session.id}
                            className="glass-card rounded-2xl border border-border p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badgeClass}`}>
                                    {badgeLabel}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {isZh ? "更新于 " : "Updated "}
                                    {formatRelativeTime(session.last_message_at || session.updated_at, isZh)}
                                  </span>
                                </div>
                                <h3 className="mt-2 truncate text-base font-semibold text-foreground">{title}</h3>
                                <p className="mt-1 truncate text-sm text-muted-foreground">{summary}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {isZh ? `${session.message_count} 条消息` : `${session.message_count} messages`}
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-wrap gap-2">
                                <Link
                                  href={`/analyze?chat_session=${encodeURIComponent(session.id)}`}
                                  className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                                >
                                  {isZh ? "继续聊天" : "Continue Chat"}
                                </Link>
                                {session.video_id && (
                                  <Link
                                    href={`/history/${session.video_id}`}
                                    className="rounded-xl border border-border px-3 py-2 text-sm font-semibold transition-colors hover:border-red-300"
                                  >
                                    {isZh ? "查看视频" : "Open Video"}
                                  </Link>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteSession(session)}
                                  disabled={deletingSessionId === session.id}
                                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
                                >
                                  {deletingSessionId === session.id ? (isZh ? "删除中..." : "Deleting...") : isZh ? "删除" : "Delete"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

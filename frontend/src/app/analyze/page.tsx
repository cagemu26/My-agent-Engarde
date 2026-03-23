"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { authFetch, buildApiUrl, buildAuthedApiUrl } from "@/lib/api";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ReportMarkdown } from "@/components/report-markdown";
import { TopNav } from "@/components/top-nav";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PoseAnalysisResult {
  video_id: string;
  message: string;
  pose_data_path: string;
  processed_frames: number;
  total_frames: number;
}

interface VideoFile {
  id?: string;
  file: File;
  name: string;
  size: number;
  status: "pending" | "uploading" | "processing" | "complete" | "error";
  progress: number;
  weapon?: string;
  analysisDepth?: number;
}

interface VideoMetadataInput {
  title: string;
  athlete: string;
  opponent: string;
  matchResult: string;
  score: string;
  tournament: string;
}

interface HistoryItem {
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

interface AnalysisReportRecord {
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

interface OverflowMeta {
  truncated: boolean;
  original_frames: number;
  used_frames: number;
  coverage_ratio: number;
}

interface ContextStatusMeta {
  video_id: string;
  video_title: string;
  mode: "full_pose";
  overflow: OverflowMeta;
  updated_at: string;
}

interface ChatContextPack {
  video_id: string;
  mode: "full_pose";
  metadata: {
    title: string;
    athlete: string;
    opponent: string;
    weapon: string;
    tournament: string;
    match_result: string;
    score: string;
    upload_time: string;
  };
  report_excerpt: string;
  pose_frames: Array<{
    frame_index: number;
    timestamp: number | null;
    key_points: Record<string, { x: number; y: number; z: number; visibility: number }>;
  }>;
  overflow: OverflowMeta;
}

interface VideoQASession {
  video_id: string;
  messages: Message[];
  context_summary: string;
  context_status: ContextStatusMeta | null;
  suggested_prompts: string[];
  needs_full_context: boolean;
  updated_at: string;
}

interface ExternalContextStatus {
  source: "training";
  label: string;
  window: string;
  entry_count: number;
  updated_at: string;
}

interface TrainingHandoffPayload {
  context: string;
  summary: string;
  status: ExternalContextStatus;
  suggested_prompts?: string[];
  opening_message?: string;
  auto_question?: string;
}

type AnalysisMode = "pose" | "action";
type AnalyzeTab = "analyze" | "chat" | "history";

interface HistoryGroup {
  key: "today" | "week" | "earlier";
  label: string;
  items: HistoryItem[];
}

const SIDEBAR_STORAGE_KEY = "engarde.analyze.historySidebarCollapsed";
const VIDEO_SESSION_STORAGE_PREFIX = "video_qa_session:";
const TRAINING_HANDOFF_STORAGE_KEY = "engarde.training.handoff";
const MAX_SESSION_MESSAGES = 30;
const MAX_SESSION_VIDEOS = 20;
const MAX_CONTEXT_CHARS = 22000;
const TARGET_CONTEXT_FRAMES = 160;
const MIN_CONTEXT_FRAMES = 52;
const MAX_REPORT_EXCERPT_CHARS = 900;

const DEFAULT_CHAT_OPENING =
  "Hi! I'm your fencing AI coach. Ask me anything about technique, training, or analyze your videos. How can I help you today?";

const DEFAULT_QUICK_PROMPTS = [
  "How to improve my lunge?",
  "What are common footwork mistakes?",
  "How to defend against attacks?",
  "What is a good weekly training routine?",
];

const KEY_POINT_INDEXES: Record<string, number> = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
};

const ANALYSIS_MODES = [
  { value: "pose", label: "Pose Detection", description: "MediaPipe skeleton overlay", icon: "🦴" },
  { value: "action", label: "Action Recognition", description: "CNN-based detection (Coming Soon)", icon: "🎯" },
];

const WEAPON_TYPES = [
  { value: "foil", label: "Foil", color: "#F97316", bg: "bg-orange-500" },
  { value: "epee", label: "Epee", color: "#DC2626", bg: "bg-red-600" },
  { value: "sabre", label: "Sabre", color: "#06B6D4", bg: "bg-cyan-500" },
];

const WEAPON_TYPE_NOTES: Record<string, string> = {
  foil: "Emphasizes right-of-way timing, blade control, and clean point line entries.",
  epee: "Prioritizes distance management, counter-time, and single-light risk control.",
  sabre: "Focuses on explosive first actions, tempo shifts, and compact recovery steps.",
};

const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm"];

const ANALYZE_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

const safeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const roundTo = (value: number, digits = 3) => Number(value.toFixed(digits));

const buildReportContextText = (report: AnalysisReportRecord | null): string => {
  if (!report) return "";
  const summary = report.summary?.trim();
  const body = report.report?.trim();
  if (summary && body) {
    return `Summary: ${summary}\n\n${body}`;
  }
  return summary || body || "";
};

const sampleEvenly = <T,>(items: T[], count: number): T[] => {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return [...items];
  if (count === 1) return [items[Math.floor(items.length / 2)]];

  const result: T[] = [];
  const lastIndex = items.length - 1;
  const step = lastIndex / (count - 1);

  for (let i = 0; i < count; i += 1) {
    result.push(items[Math.round(i * step)]);
  }

  return result;
};

const layeredSampleFrames = <T extends { frame_index: number }>(frames: T[], targetCount: number): T[] => {
  if (targetCount <= 0 || frames.length === 0) return [];
  if (frames.length <= targetCount) return [...frames];

  const clampedTarget = Math.max(3, targetCount);
  const headCount = Math.min(Math.max(12, Math.floor(clampedTarget * 0.22)), Math.floor(clampedTarget / 2));
  const tailCount = Math.min(Math.max(12, Math.floor(clampedTarget * 0.22)), Math.floor(clampedTarget / 2));
  const middleCount = Math.max(0, clampedTarget - headCount - tailCount);

  const head = frames.slice(0, headCount);
  const tail = frames.slice(Math.max(headCount, frames.length - tailCount));
  const middleSource = frames.slice(head.length, Math.max(head.length, frames.length - tail.length));
  const middle = sampleEvenly(middleSource, middleCount);

  const merged = [...head, ...middle, ...tail];
  const deduped = Array.from(new Map(merged.map((frame) => [frame.frame_index, frame])).values());
  return deduped.sort((a, b) => a.frame_index - b.frame_index);
};

const buildSessionStorageKey = (videoId: string) => `${VIDEO_SESSION_STORAGE_PREFIX}${videoId}`;

const formatRelativeTime = (dateString: string) => {
  if (!dateString) return "Unknown";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
};

const getWeaponLabel = (weapon: string) => {
  const labels: Record<string, string> = {
    foil: "Foil",
    epee: "Epee",
    sabre: "Sabre",
  };
  return labels[weapon?.toLowerCase()] || weapon || "Unknown";
};

const getWeaponColor = (weapon: string) => {
  const colors: Record<string, string> = {
    foil: "#F97316",
    epee: "#DC2626",
    sabre: "#06B6D4",
  };
  return colors[weapon?.toLowerCase()] || "#6B7280";
};

const getResultLabel = (matchResult: string) => {
  const result = matchResult?.toLowerCase();
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  if (result === "draw") return "Draw";
  return "";
};

function AnalyzeContent() {
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<AnalyzeTab>("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: DEFAULT_CHAT_OPENING,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isContextPreparing, setIsContextPreparing] = useState(false);
  const [videoFile, setVideoFile] = useState<VideoFile | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState("epee");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("pose");
  const [poseResult, setPoseResult] = useState<PoseAnalysisResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<VideoMetadataInput>({
    title: "",
    athlete: "",
    opponent: "",
    matchResult: "",
    score: "",
    tournament: "",
  });

  const [historyVideos, setHistoryVideos] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");

  const [selectedHistoryVideoId, setSelectedHistoryVideoId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<HistoryItem | null>(null);
  const [historyPoseData, setHistoryPoseData] = useState<PoseData | null>(null);
  const [historyReport, setHistoryReport] = useState<AnalysisReportRecord | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [historyReportLoading, setHistoryReportLoading] = useState(false);
  const [historyReportError, setHistoryReportError] = useState<string | null>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  const [hasHandledSearchParamVideo, setHasHandledSearchParamVideo] = useState(false);
  const [hasHandledTrainingHandoff, setHasHandledTrainingHandoff] = useState(false);
  const [pendingAutoQuestion, setPendingAutoQuestion] = useState<string | null>(null);
  const [activeChatVideoId, setActiveChatVideoId] = useState<string | null>(null);
  const [chatContextPack, setChatContextPack] = useState<ChatContextPack | null>(null);
  const [chatContextSummary, setChatContextSummary] = useState("");
  const [chatContextStatus, setChatContextStatus] = useState<ContextStatusMeta | null>(null);
  const [externalContextPayload, setExternalContextPayload] = useState<string | null>(null);
  const [externalContextSummary, setExternalContextSummary] = useState("");
  const [externalContextStatus, setExternalContextStatus] = useState<ExternalContextStatus | null>(null);
  const [needsExternalContextForNextSend, setNeedsExternalContextForNextSend] = useState(false);
  const [chatSuggestedPrompts, setChatSuggestedPrompts] = useState<string[]>(DEFAULT_QUICK_PROMPTS);
  const [needsFullContextForNextSend, setNeedsFullContextForNextSend] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionSwitchRef = useRef(0);
  const processingProgressTimerRef = useRef<number | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const stopProcessingProgress = useCallback(() => {
    if (processingProgressTimerRef.current === null) return;
    window.clearInterval(processingProgressTimerRef.current);
    processingProgressTimerRef.current = null;
  }, []);

  const startProcessingProgress = useCallback((target = 96) => {
    stopProcessingProgress();
    processingProgressTimerRef.current = window.setInterval(() => {
      setVideoFile((prev) => {
        if (!prev || prev.status !== "processing") return prev;
        if (prev.progress >= target) return prev;

        const remaining = target - prev.progress;
        const step = Math.max(0.4, remaining * 0.1);
        return {
          ...prev,
          progress: Math.min(target, Number((prev.progress + step).toFixed(1))),
        };
      });
    }, 250);
  }, [stopProcessingProgress]);

  useEffect(() => {
    return () => stopProcessingProgress();
  }, [stopProcessingProgress]);

  const extractPoseFrames = useCallback((poseData: PoseData | null) => {
    if (!poseData?.pose_sequence) return [] as ChatContextPack["pose_frames"];

    return poseData.pose_sequence
      .map((frame) => {
        const landmarks = Array.isArray((frame as { landmarks?: unknown }).landmarks)
          ? ((frame as { landmarks: unknown[] }).landmarks ?? [])
          : [];
        const visibilityArray = Array.isArray((frame as { visibility?: unknown }).visibility)
          ? ((frame as { visibility: unknown[] }).visibility ?? [])
          : [];

        const keyPoints: Record<string, { x: number; y: number; z: number; visibility: number }> = {};

        Object.entries(KEY_POINT_INDEXES).forEach(([name, index]) => {
          const landmark = landmarks[index];
          if (!landmark) return;

          if (Array.isArray(landmark)) {
            keyPoints[name] = {
              x: roundTo(safeNumber(landmark[0]), 2),
              y: roundTo(safeNumber(landmark[1]), 2),
              z: roundTo(safeNumber(landmark[2]), 2),
              visibility: roundTo(safeNumber(landmark[3] ?? visibilityArray[index], 1), 2),
            };
            return;
          }

          if (typeof landmark === "object") {
            const item = landmark as Record<string, unknown>;
            keyPoints[name] = {
              x: roundTo(safeNumber(item.x), 2),
              y: roundTo(safeNumber(item.y), 2),
              z: roundTo(safeNumber(item.z), 2),
              visibility: roundTo(safeNumber(item.visibility ?? visibilityArray[index], 1), 2),
            };
          }
        });

        return {
          frame_index: safeNumber((frame as { frame_index?: unknown }).frame_index),
          timestamp: (frame as { timestamp?: unknown }).timestamp !== undefined
            ? roundTo(safeNumber((frame as { timestamp?: unknown }).timestamp), 2)
            : null,
          key_points: keyPoints,
        };
      })
      .filter((frame) => Object.keys(frame.key_points).length > 0);
  }, []);

  const buildContextSummary = useCallback(
    (video: HistoryItem, reportExcerpt: string, overflow: OverflowMeta) => {
      const summaryLines = [
        `Video: ${video.title || "Untitled"} (${getWeaponLabel(video.weapon)})`,
        `Athlete/Opponent: ${video.athlete || "Unknown"} / ${video.opponent || "Unknown"}`,
        `Tournament: ${video.tournament || "Not set"} | Score: ${video.score || "N/A"} | Result: ${getResultLabel(video.match_result) || "N/A"}`,
      ];

      summaryLines.push(
        `Pose coverage: ${overflow.used_frames}/${overflow.original_frames} frames (${Math.round(overflow.coverage_ratio * 100)}%)`,
      );

      if (reportExcerpt) {
        summaryLines.push(`Report excerpt: ${reportExcerpt.slice(0, 420)}`);
      }

      return summaryLines.join("\n");
    },
    [],
  );

  const buildSuggestedPrompts = useCallback((video: HistoryItem) => {
    const weaponLabel = getWeaponLabel(video.weapon);
    const title = video.title || "this bout";

    return [
      `For ${title}, what are my top 3 priority fixes?`,
      `Design a 20-minute ${weaponLabel} drill plan based on this video.`,
      "Which movement pattern causes most of my defensive risk?",
      "Give me cue words to remember before my next point.",
    ];
  }, []);

  const buildContextArtifacts = useCallback(
    (
      video: HistoryItem,
      poseData: PoseData | null,
      reportText: string,
    ): {
      contextPack: ChatContextPack;
      contextString: string;
      contextSummary: string;
      contextStatus: ContextStatusMeta;
      suggestedPrompts: string[];
    } => {
      const allFrames = extractPoseFrames(poseData);
      const originalFrameCount = allFrames.length;
      let sampledFrames = layeredSampleFrames(allFrames, Math.min(TARGET_CONTEXT_FRAMES, Math.max(0, originalFrameCount)));

      let reportExcerpt = reportText.trim().slice(0, MAX_REPORT_EXCERPT_CHARS);
      let contextString = "";
      let overflow: OverflowMeta = {
        truncated: sampledFrames.length < originalFrameCount,
        original_frames: originalFrameCount,
        used_frames: sampledFrames.length,
        coverage_ratio: originalFrameCount > 0 ? sampledFrames.length / originalFrameCount : 0,
      };

      let contextPack: ChatContextPack = {
        video_id: video.video_id,
        mode: "full_pose",
        metadata: {
          title: video.title || "Untitled",
          athlete: video.athlete || "",
          opponent: video.opponent || "",
          weapon: video.weapon || "epee",
          tournament: video.tournament || "",
          match_result: video.match_result || "",
          score: video.score || "",
          upload_time: video.upload_time || "",
        },
        report_excerpt: reportExcerpt,
        pose_frames: sampledFrames,
        overflow,
      };

      let guard = 0;
      do {
        contextPack = { ...contextPack, pose_frames: sampledFrames, report_excerpt: reportExcerpt, overflow };
        contextString = JSON.stringify(contextPack);

        if (contextString.length <= MAX_CONTEXT_CHARS) break;

        if (sampledFrames.length > MIN_CONTEXT_FRAMES) {
          const nextCount = Math.max(MIN_CONTEXT_FRAMES, Math.floor(sampledFrames.length * 0.78));
          sampledFrames = layeredSampleFrames(allFrames, nextCount);
        } else if (reportExcerpt.length > 280) {
          reportExcerpt = reportExcerpt.slice(0, Math.floor(reportExcerpt.length * 0.7));
        } else {
          break;
        }

        overflow = {
          truncated: sampledFrames.length < originalFrameCount,
          original_frames: originalFrameCount,
          used_frames: sampledFrames.length,
          coverage_ratio: originalFrameCount > 0 ? sampledFrames.length / originalFrameCount : 0,
        };

        guard += 1;
      } while (guard < 8);

      contextPack = { ...contextPack, pose_frames: sampledFrames, report_excerpt: reportExcerpt, overflow };
      const contextSummary = buildContextSummary(video, reportExcerpt, overflow);
      const contextStatus: ContextStatusMeta = {
        video_id: video.video_id,
        video_title: video.title || "Untitled",
        mode: "full_pose",
        overflow,
        updated_at: new Date().toISOString(),
      };

      return {
        contextPack,
        contextString: JSON.stringify(contextPack),
        contextSummary,
        contextStatus,
        suggestedPrompts: buildSuggestedPrompts(video),
      };
    },
    [buildContextSummary, buildSuggestedPrompts, extractPoseFrames],
  );

  const pruneVideoSessions = useCallback((keepVideoId?: string) => {
    if (typeof window === "undefined") return;

    const sessions: Array<{ key: string; videoId: string; updatedAt: string }> = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(VIDEO_SESSION_STORAGE_PREFIX)) continue;

      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const session = JSON.parse(raw) as Partial<VideoQASession>;
        sessions.push({
          key,
          videoId: key.replace(VIDEO_SESSION_STORAGE_PREFIX, ""),
          updatedAt: session.updated_at || "",
        });
      } catch {
        continue;
      }
    }

    if (sessions.length <= MAX_SESSION_VIDEOS) return;

    const sortedSessions = sessions.sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
    );
    let removable = sortedSessions.length - MAX_SESSION_VIDEOS;

    for (const session of sortedSessions) {
      if (removable <= 0) break;
      if (keepVideoId && session.videoId === keepVideoId) continue;
      window.localStorage.removeItem(session.key);
      removable -= 1;
    }
  }, []);

  const persistVideoSession = useCallback(
    (
      videoId: string,
      nextMessages: Message[],
      contextSummary: string,
      contextStatus: ContextStatusMeta | null,
      suggestedPrompts: string[],
      needsFullContext: boolean,
    ) => {
      if (typeof window === "undefined" || !videoId) return;

      const sanitizedMessages = nextMessages.slice(-MAX_SESSION_MESSAGES);
      const session: VideoQASession = {
        video_id: videoId,
        messages: sanitizedMessages,
        context_summary: contextSummary,
        context_status: contextStatus,
        suggested_prompts: suggestedPrompts,
        needs_full_context: needsFullContext,
        updated_at: new Date().toISOString(),
      };

      window.localStorage.setItem(buildSessionStorageKey(videoId), JSON.stringify(session));
      pruneVideoSessions(videoId);
    },
    [pruneVideoSessions],
  );

  const readVideoSession = useCallback((videoId: string): VideoQASession | null => {
    if (typeof window === "undefined" || !videoId) return null;
    const raw = window.localStorage.getItem(buildSessionStorageKey(videoId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as VideoQASession;
    } catch {
      return null;
    }
  }, []);

  const fetchHistoryVideos = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const response = await authFetch("/video/list");
      if (!response.ok) {
        throw new Error("Failed to fetch videos");
      }
      const data = await response.json();
      setHistoryVideos(data.videos || []);
      setHistoryError(null);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchVideoContextData = useCallback(
    async (videoId: string): Promise<{ video: HistoryItem; pose: PoseData | null; report: AnalysisReportRecord | null }> => {
      const videoResponse = await authFetch(`/video/${videoId}`);
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch video details");
      }
      const video = (await videoResponse.json()) as HistoryItem;

      let pose: PoseData | null = null;
      let report: AnalysisReportRecord | null = null;

      try {
        const poseResponse = await authFetch(`/video/${videoId}/pose-data`);
        if (poseResponse.ok) {
          pose = (await poseResponse.json()) as PoseData;
        }
      } catch {
        pose = null;
      }

      try {
        const reportResponse = await authFetch(`/video/${videoId}/analysis-report`);
        if (reportResponse.ok) {
          report = (await reportResponse.json()) as AnalysisReportRecord;
        }
      } catch {
        report = null;
      }

      return { video, pose, report };
    },
    [],
  );

  const loadHistoryDetail = useCallback(
    async (videoId: string): Promise<{ video: HistoryItem; pose: PoseData | null; report: AnalysisReportRecord | null } | null> => {
      try {
        setHistoryDetailLoading(true);
        setHistoryDetailError(null);
        setHistoryReportError(null);
        setHistoryReport(null);

        const contextData = await fetchVideoContextData(videoId);
        setHistoryDetail(contextData.video);
        setHistoryPoseData(contextData.pose);
        setHistoryReport(contextData.report);
        return contextData;
      } catch (err) {
        setHistoryDetailError(err instanceof Error ? err.message : "Failed to load history detail");
        setHistoryDetail(null);
        setHistoryPoseData(null);
        setHistoryReport(null);
        return null;
      } finally {
        setHistoryDetailLoading(false);
      }
    },
    [fetchVideoContextData],
  );

  const buildHandoffMessage = useCallback(
    (
      video: HistoryItem,
      reportText: string,
      overflow: OverflowMeta,
      prompts: string[],
    ) => {
      const reportSummary = reportText
        ? reportText.replace(/\s+/g, " ").trim().slice(0, 320)
        : "Report is not generated yet. I will still coach based on the available pose data.";

      const lines = [
        "Video analysis is now linked to AI coaching.",
        "",
        `- Video: ${video.title || "Untitled"} (${getWeaponLabel(video.weapon)})`,
        `- Opponent: ${video.opponent || "Unknown"} | Tournament: ${video.tournament || "N/A"}`,
        `- Context coverage: ${overflow.used_frames}/${overflow.original_frames} frames (${Math.round(overflow.coverage_ratio * 100)}%)${overflow.truncated ? " (truncated)" : ""}`,
        "",
        `Summary: ${reportSummary}`,
        "",
        "Suggested follow-ups:",
        ...prompts.map((prompt, index) => `${index + 1}. ${prompt}`),
      ];

      return lines.join("\n");
    },
    [],
  );

  const activateVideoChatSession = useCallback(
    async (
      videoId: string,
      options?: {
        forceNewSession?: boolean;
        switchToChat?: boolean;
        reportText?: string;
        preloaded?: { video: HistoryItem; pose: PoseData | null; report: AnalysisReportRecord | null } | null;
      },
    ) => {
      if (!videoId) return;

      const switchId = sessionSwitchRef.current + 1;
      sessionSwitchRef.current = switchId;
      setIsContextPreparing(true);
      setActiveChatVideoId(videoId);
      setSessionHydrated(false);
      setExternalContextPayload(null);
      setExternalContextSummary("");
      setExternalContextStatus(null);
      setNeedsExternalContextForNextSend(false);

      if (!options?.forceNewSession) {
        const existingSession = readVideoSession(videoId);
        if (existingSession) {
          if (switchId !== sessionSwitchRef.current) return;

          const hydratedMessages: Message[] = existingSession.messages?.length
            ? existingSession.messages
            : [{ role: "assistant", content: DEFAULT_CHAT_OPENING }];
          const preloadedReportText = options?.reportText ?? buildReportContextText(options?.preloaded?.report ?? null);
          let nextContextSummary = existingSession.context_summary || "";
          let nextContextStatus = existingSession.context_status || null;
          let nextSuggestedPrompts =
            existingSession.suggested_prompts?.length ? existingSession.suggested_prompts : DEFAULT_QUICK_PROMPTS;
          let nextNeedsFullContext = Boolean(existingSession.needs_full_context);

          if (options?.preloaded) {
            const refreshedArtifacts = buildContextArtifacts(
              options.preloaded.video,
              options.preloaded.pose,
              preloadedReportText,
            );
            nextContextSummary = refreshedArtifacts.contextSummary;
            nextContextStatus = refreshedArtifacts.contextStatus;
            nextSuggestedPrompts = refreshedArtifacts.suggestedPrompts;
            nextNeedsFullContext = true;
            persistVideoSession(
              videoId,
              hydratedMessages,
              refreshedArtifacts.contextSummary,
              refreshedArtifacts.contextStatus,
              refreshedArtifacts.suggestedPrompts,
              true,
            );
          }

          setMessages(hydratedMessages);
          setChatContextSummary(nextContextSummary);
          setChatContextStatus(nextContextStatus);
          setChatSuggestedPrompts(nextSuggestedPrompts);
          setNeedsFullContextForNextSend(nextNeedsFullContext);
          setChatContextPack(null);
          setSessionHydrated(true);

          if (options?.switchToChat) {
            setActiveTab("chat");
          }

          setIsContextPreparing(false);
          return;
        }
      }

      try {
        const contextData = options?.preloaded ?? (await fetchVideoContextData(videoId));
        if (!contextData || switchId !== sessionSwitchRef.current) return;
        const reportText = options?.reportText ?? buildReportContextText(contextData.report);

        const artifacts = buildContextArtifacts(
          contextData.video,
          contextData.pose,
          reportText,
        );

        const handoffMessage = buildHandoffMessage(
          contextData.video,
          reportText,
          artifacts.contextStatus.overflow,
          artifacts.suggestedPrompts,
        );

        const handoffMessages: Message[] = [{ role: "assistant", content: handoffMessage }];

        setMessages(handoffMessages);
        setChatContextSummary(artifacts.contextSummary);
        setChatContextStatus(artifacts.contextStatus);
        setChatSuggestedPrompts(artifacts.suggestedPrompts);
        setNeedsFullContextForNextSend(true);
        setChatContextPack(artifacts.contextPack);
        setSessionHydrated(true);
        persistVideoSession(
          videoId,
          handoffMessages,
          artifacts.contextSummary,
          artifacts.contextStatus,
          artifacts.suggestedPrompts,
          true,
        );

        if (options?.switchToChat) {
          setActiveTab("chat");
        }
      } finally {
        if (switchId === sessionSwitchRef.current) {
          setIsContextPreparing(false);
        }
      }
    },
    [buildContextArtifacts, buildHandoffMessage, fetchVideoContextData, persistVideoSession, readVideoSession],
  );

  const handleClearChatContext = useCallback(() => {
    setActiveChatVideoId(null);
    setChatContextPack(null);
    setChatContextSummary("");
    setChatContextStatus(null);
    setExternalContextPayload(null);
    setExternalContextSummary("");
    setExternalContextStatus(null);
    setNeedsExternalContextForNextSend(false);
    setChatSuggestedPrompts(DEFAULT_QUICK_PROMPTS);
    setNeedsFullContextForNextSend(false);
    setPendingAutoQuestion(null);
    setMessages([{ role: "assistant", content: DEFAULT_CHAT_OPENING }]);
    setSessionHydrated(false);
  }, []);

  const handleSwitchVideoFromChat = useCallback(() => {
    setActiveTab("history");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobileSidebarOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionHydrated || !activeChatVideoId) return;
    persistVideoSession(
      activeChatVideoId,
      messages,
      chatContextSummary,
      chatContextStatus,
      chatSuggestedPrompts,
      needsFullContextForNextSend,
    );
  }, [
    activeChatVideoId,
    chatContextStatus,
    chatContextSummary,
    chatSuggestedPrompts,
    messages,
    needsFullContextForNextSend,
    persistVideoSession,
    sessionHydrated,
  ]);

  useEffect(() => {
    fetchHistoryVideos();
  }, [fetchHistoryVideos]);

  useEffect(() => {
    setSidebarHydrated(true);
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    setIsSidebarCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    if (!sidebarHydrated) return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, isSidebarCollapsed ? "1" : "0");
  }, [isSidebarCollapsed, sidebarHydrated]);

  useEffect(() => {
    if (hasHandledTrainingHandoff) return;

    const hasTrainingContext = searchParams.get("training_context") === "1";
    if (!hasTrainingContext) {
      setHasHandledTrainingHandoff(true);
      return;
    }

    const raw = window.localStorage.getItem(TRAINING_HANDOFF_STORAGE_KEY);
    if (!raw) {
      setHasHandledTrainingHandoff(true);
      return;
    }

    try {
      const handoff = JSON.parse(raw) as TrainingHandoffPayload;
      if (!handoff.context) {
        throw new Error("Missing context payload");
      }

      setMessages([
        {
          role: "assistant",
          content:
            handoff.opening_message ||
            "Training context attached. Ask for fatigue analysis and next-step training guidance.",
        },
      ]);
      setActiveTab("chat");
      setActiveChatVideoId(null);
      setChatContextPack(null);
      setChatContextSummary(handoff.summary || "");
      setChatContextStatus(null);
      setExternalContextPayload(handoff.context);
      setExternalContextSummary(handoff.summary || "");
      setExternalContextStatus(handoff.status || null);
      setNeedsExternalContextForNextSend(true);
      setChatSuggestedPrompts(
        handoff.suggested_prompts?.length ? handoff.suggested_prompts : DEFAULT_QUICK_PROMPTS,
      );
      setNeedsFullContextForNextSend(false);
      setSessionHydrated(false);
      const autoQuestion =
        handoff.auto_question?.trim() ||
        handoff.suggested_prompts?.[0]?.trim() ||
        "评估我最近疲劳和下周负荷安排。";
      setPendingAutoQuestion(autoQuestion);
    } catch {
      // Ignore malformed payload and continue with normal flow.
    } finally {
      window.localStorage.removeItem(TRAINING_HANDOFF_STORAGE_KEY);
      setHasHandledTrainingHandoff(true);
    }
  }, [hasHandledTrainingHandoff, searchParams]);

  useEffect(() => {
    if (historyLoading || hasHandledSearchParamVideo) return;

    const videoId = searchParams.get("video");
    if (videoId) {
      setSelectedHistoryVideoId(videoId);
      setActiveTab("history");
      void (async () => {
        const preloaded = await loadHistoryDetail(videoId);
        await activateVideoChatSession(videoId, { preloaded });
      })();
    }

    setHasHandledSearchParamVideo(true);
  }, [historyLoading, hasHandledSearchParamVideo, searchParams, loadHistoryDetail, activateVideoChatSession]);

  const handleSelectHistoryVideo = useCallback(
    (videoId: string) => {
      setSelectedHistoryVideoId(videoId);
      setActiveTab("history");
      setIsMobileSidebarOpen(false);
      void (async () => {
        const preloaded = await loadHistoryDetail(videoId);
        await activateVideoChatSession(videoId, { preloaded });
      })();
    },
    [activateVideoChatSession, loadHistoryDetail],
  );

  const handleGenerateHistoryReport = useCallback(async () => {
    if (!selectedHistoryVideoId) return;

    try {
      setHistoryReportLoading(true);
      setHistoryReportError(null);

      const regenerateQuery = historyReport ? "?force_regenerate=true" : "";
      const response = await authFetch(`/video/${selectedHistoryVideoId}/analyze/pose/report${regenerateQuery}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      const data = (await response.json()) as AnalysisReportRecord;
      setHistoryReport(data);
      if (selectedHistoryVideoId && selectedHistoryVideoId === activeChatVideoId) {
        setNeedsFullContextForNextSend(true);
        setChatContextPack(null);
      }
    } catch (err) {
      setHistoryReportError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setHistoryReportLoading(false);
    }
  }, [activeChatVideoId, historyReport, selectedHistoryVideoId]);

  const handleAskAiAboutHistory = useCallback(() => {
    if (!historyDetail) return;

    const title = historyDetail.title || "this match";
    const opponent = historyDetail.opponent ? ` vs ${historyDetail.opponent}` : "";
    const prompt = `Please review ${title}${opponent} and give me 3 concrete improvements for my next training session.`;

    if (selectedHistoryVideoId && selectedHistoryVideoId !== activeChatVideoId) {
      void activateVideoChatSession(selectedHistoryVideoId);
    }
    setInput(prompt);
    setActiveTab("chat");
  }, [activeChatVideoId, activateVideoChatSession, historyDetail, selectedHistoryVideoId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = useCallback((file: File): boolean => {
    const allowedTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    const normalizedName = file.name.toLowerCase();
    const hasAllowedExtension = ALLOWED_VIDEO_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
    return (allowedTypes.includes(file.type) || hasAllowedExtension) && file.size <= MAX_FILE_SIZE;
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!validateFile(file)) {
        setUploadError(
          `Invalid file. Please upload MP4, MOV, AVI, or WebM files under ${MAX_FILE_SIZE_MB}MB.`,
        );
        return;
      }
      setUploadError(null);
      setVideoFile({
        file,
        name: file.name,
        size: file.size,
        status: "pending",
        progress: 0,
      });
    },
    [validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const ensureActiveVideoContext = useCallback(async () => {
    if (!activeChatVideoId) return null;

    if (chatContextPack && chatContextStatus) {
      return {
        contextString: JSON.stringify(chatContextPack),
        contextSummary: chatContextSummary,
        contextStatus: chatContextStatus,
      };
    }

    const contextData = await fetchVideoContextData(activeChatVideoId);
    const reportText = buildReportContextText(contextData.report);
    const artifacts = buildContextArtifacts(
      contextData.video,
      contextData.pose,
      reportText,
    );

    setChatContextPack(artifacts.contextPack);
    setChatContextSummary(artifacts.contextSummary);
    setChatContextStatus(artifacts.contextStatus);
    setChatSuggestedPrompts(artifacts.suggestedPrompts);

    return {
      contextString: artifacts.contextString,
      contextSummary: artifacts.contextSummary,
      contextStatus: artifacts.contextStatus,
    };
  }, [
    activeChatVideoId,
    buildContextArtifacts,
    chatContextPack,
    chatContextStatus,
    chatContextSummary,
    fetchVideoContextData,
  ]);

  const handleUpload = async () => {
    if (!videoFile) return;

    stopProcessingProgress();
    setVideoFile((prev) => (prev ? { ...prev, status: "uploading", progress: 8 } : null));

    try {
      const formData = new FormData();
      formData.append("file", videoFile.file);
      formData.append("title", metadata.title || videoFile.name);
      formData.append("athlete", metadata.athlete);
      formData.append("opponent", metadata.opponent);
      formData.append("weapon", selectedWeapon);
      formData.append("match_result", metadata.matchResult);
      formData.append("score", metadata.score);
      formData.append("tournament", metadata.tournament);

      const uploadResponse = await authFetch("/video/upload-with-metadata", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      const uploadData = await uploadResponse.json();
      setVideoFile((prev) => (prev ? { ...prev, progress: 55, id: uploadData.video_id } : null));
      setVideoFile((prev) => (prev ? { ...prev, status: "processing", progress: 62 } : null));
      startProcessingProgress();

      let reportMessage = "";

      if (analysisMode === "pose") {
        const analyzeResponse = await authFetch("/video/analyze/pose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: uploadData.video_id,
          }),
        });

        if (!analyzeResponse.ok) {
          throw new Error("Pose analysis failed");
        }

        const analyzeData: PoseAnalysisResult = await analyzeResponse.json();
        setPoseResult(analyzeData);
        setVideoFile((prev) =>
          prev ? { ...prev, progress: Math.max(prev.progress, 88) } : null,
        );

        reportMessage = `Pose analysis complete! Generated skeleton overlay video and extracted ${analyzeData.total_frames} frames of pose data.`;

        try {
          setVideoFile((prev) =>
            prev ? { ...prev, progress: Math.max(prev.progress, 92) } : null,
          );
          const reportResponse = await authFetch(`/video/${uploadData.video_id}/analyze/pose/report`, {
            method: "POST",
          });

          if (reportResponse.ok) {
            const reportData = await reportResponse.json();
            if (reportData.report) {
              reportMessage = reportData.report;
            }
          }
        } catch (reportError) {
          console.error("Failed to generate pose report:", reportError);
        }
      } else {
        const analyzeResponse = await authFetch("/video/analyze/cnn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: uploadData.video_id,
            weapon: selectedWeapon,
          }),
        });

        if (!analyzeResponse.ok) {
          reportMessage =
            "Action Recognition is coming soon. I can still coach this video from metadata and the available pose data.";
        } else {
          await analyzeResponse.json();
          setVideoFile((prev) =>
            prev ? { ...prev, progress: Math.max(prev.progress, 92) } : null,
          );
          reportMessage = "Analysis complete. Ready to coach this video with contextual Q&A.";
        }
      }

      stopProcessingProgress();
      setVideoFile((prev) => (prev ? { ...prev, status: "complete", progress: 100 } : null));
      setSelectedHistoryVideoId(uploadData.video_id);
      setUploadError(null);
      const preloaded = await loadHistoryDetail(uploadData.video_id);
      await activateVideoChatSession(uploadData.video_id, {
        forceNewSession: true,
        switchToChat: true,
        reportText: reportMessage,
        preloaded,
      });
      void fetchHistoryVideos();
    } catch (error) {
      console.error("Upload error:", error);
      stopProcessingProgress();
      setVideoFile((prev) => (prev ? { ...prev, status: "error", progress: 0 } : null));
      setUploadError("Upload or analysis failed. Please try again.");
    }
  };

  const handleRemoveVideo = () => {
    const message =
      videoFile?.status === "uploading" || videoFile?.status === "processing"
        ? "Analysis is in progress. Remove this video and stop the current task?"
        : "Remove this selected video?";
    if (!window.confirm(message)) return;

    stopProcessingProgress();
    setVideoFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const sendMessage = useCallback(
    async (rawMessage: string) => {
      const userMessage = rawMessage.trim();
      if (!userMessage || isTyping || isContextPreparing) return;

      setInput("");
      const nextMessages = [...messages, { role: "user" as const, content: userMessage }];
      setMessages(nextMessages);
      setIsTyping(true);

      try {
        const recentMessages = nextMessages.slice(-10);
        let contextPayload: string | undefined;

        if (activeChatVideoId) {
          if (needsFullContextForNextSend) {
            const fullContext = await ensureActiveVideoContext();
            if (fullContext?.contextString) {
              contextPayload = fullContext.contextString;
              setChatContextSummary(fullContext.contextSummary);
              setChatContextStatus(fullContext.contextStatus);
            }
          } else if (chatContextSummary) {
            contextPayload = chatContextSummary;
          }
        } else if (needsExternalContextForNextSend && externalContextPayload) {
          contextPayload = externalContextPayload;
        } else if (externalContextSummary) {
          contextPayload = externalContextSummary;
        }

        const response = await fetch(buildApiUrl("/chat"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: recentMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context: contextPayload,
          }),
        });

        const data = await response.json();
        setIsTyping(false);
        const updatedMessages = [...nextMessages, { role: "assistant" as const, content: data.message }];
        setMessages(updatedMessages);
        setNeedsFullContextForNextSend(false);
        setNeedsExternalContextForNextSend(false);
      } catch {
        setIsTyping(false);
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          },
        ]);
      }
    },
    [
      activeChatVideoId,
      chatContextSummary,
      ensureActiveVideoContext,
      externalContextPayload,
      externalContextSummary,
      isContextPreparing,
      isTyping,
      messages,
      needsExternalContextForNextSend,
      needsFullContextForNextSend,
    ],
  );

  const handleSend = useCallback(() => {
    void sendMessage(input);
  }, [input, sendMessage]);

  useEffect(() => {
    if (!pendingAutoQuestion) return;
    if (activeTab !== "chat") return;
    if (isTyping || isContextPreparing) return;
    if (!externalContextPayload && !externalContextSummary) return;

    const question = pendingAutoQuestion;
    setPendingAutoQuestion(null);
    void sendMessage(question);
  }, [
    activeTab,
    externalContextPayload,
    externalContextSummary,
    isContextPreparing,
    isTyping,
    pendingAutoQuestion,
    sendMessage,
  ]);

  const getWeaponStyle = (weapon: string) => {
    return WEAPON_TYPES.find((w) => w.value === weapon) || WEAPON_TYPES[1];
  };

  const selectedWeaponStyle = getWeaponStyle(selectedWeapon);
  const selectedWeaponNote = WEAPON_TYPE_NOTES[selectedWeapon] ?? WEAPON_TYPE_NOTES.epee;

  const filteredHistoryVideos = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    const base = historyVideos.filter((video) => {
      if (!query) return true;

      const text = [video.title, video.athlete, video.opponent, video.tournament]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });

    return base.sort((a, b) => {
      const aTime = new Date(a.upload_time).getTime();
      const bTime = new Date(b.upload_time).getTime();
      return bTime - aTime;
    });
  }, [historyVideos, historySearch]);

  const groupedHistoryVideos = useMemo<HistoryGroup[]>(() => {
    const today: HistoryItem[] = [];
    const week: HistoryItem[] = [];
    const earlier: HistoryItem[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const video of filteredHistoryVideos) {
      const uploadDate = new Date(video.upload_time);
      if (Number.isNaN(uploadDate.getTime())) {
        earlier.push(video);
        continue;
      }

      if (uploadDate >= todayStart) {
        today.push(video);
        continue;
      }

      const diffMs = now.getTime() - uploadDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays <= 7) {
        week.push(video);
      } else {
        earlier.push(video);
      }
    }

    const groups: HistoryGroup[] = [
      { key: "today", label: "Today", items: today },
      { key: "week", label: "Last 7 Days", items: week },
      { key: "earlier", label: "Earlier", items: earlier },
    ];

    return groups.filter((group) => group.items.length > 0);
  }, [filteredHistoryVideos]);

  const renderHistoryRows = (compact: boolean) => {
    if (historyLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: compact ? 6 : 5 }).map((_, idx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className={`${compact ? "h-10" : "h-16"} rounded-xl bg-muted animate-pulse`}
            />
          ))}
        </div>
      );
    }

    if (historyError) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-red-600">
          <p>{historyError}</p>
          <button
            type="button"
            onClick={fetchHistoryVideos}
            className="mt-2 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      );
    }

    if (filteredHistoryVideos.length === 0) {
      if (historyVideos.length === 0) {
        return (
          <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No videos yet. Upload your first bout.
          </div>
        );
      }

      return (
        <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No records match your filters.
        </div>
      );
    }

    if (compact) {
      return (
        <div className="h-full space-y-2 overflow-x-hidden overflow-y-auto pr-0.5">
          {filteredHistoryVideos.map((video) => {
            const selected = selectedHistoryVideoId === video.video_id;
            const color = getWeaponColor(video.weapon);

            return (
              <button
                key={video.video_id}
                type="button"
                onClick={() => handleSelectHistoryVideo(video.video_id)}
                className={`group mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                  selected
                    ? "border-red-400 bg-red-50 text-red-600"
                    : "border-border bg-card text-muted-foreground hover:border-red-300 hover:text-foreground"
                }`}
                title={video.title || "Untitled video"}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div className="h-full space-y-5 overflow-y-auto pr-1">
        {groupedHistoryVideos.map((group) => (
          <div key={group.key}>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.items.map((video) => {
                const selected = selectedHistoryVideoId === video.video_id;
                const resultLabel = getResultLabel(video.match_result);

                return (
                  <button
                    key={video.video_id}
                    type="button"
                    onClick={() => handleSelectHistoryVideo(video.video_id)}
                    className={`w-full rounded-2xl border p-3 text-left transition-all ${
                      selected
                        ? "border-red-300 bg-red-50/80 shadow-sm"
                        : "border-border bg-card hover:border-red-200 hover:bg-card/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {video.title || "Untitled Video"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[video.athlete, video.opponent ? `vs ${video.opponent}` : "", video.tournament]
                            .filter(Boolean)
                            .join(" ") || "No metadata"}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${getWeaponColor(video.weapon)}20`,
                          color: getWeaponColor(video.weapon),
                        }}
                      >
                        {getWeaponLabel(video.weapon)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatRelativeTime(video.upload_time)}</span>
                      {resultLabel && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                          {resultLabel}
                        </span>
                      )}
                      {video.score && <span className="font-mono">{video.score}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-red-500/5 blur-[100px]" />
        <div className="absolute right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-amber-500/5 blur-[80px]" />
      </div>

      <TopNav activeHref="/analyze" links={[...ANALYZE_NAV_LINKS]} />

      <main className="pt-24 pb-8">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6">
          <div className="mb-4 flex items-center justify-end gap-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground md:hidden"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              History
            </button>
          </div>

          <div className="flex gap-4 md:gap-6">
            <aside
              className={`hidden shrink-0 transition-all duration-300 md:block ${
                isSidebarCollapsed ? "w-20" : "w-[320px]"
              }`}
            >
              <div className="glass-card flex h-[calc(100vh-140px)] min-h-[680px] flex-col rounded-3xl border border-border/60 p-3">
                {isSidebarCollapsed ? (
                  <>
                    <div className="mb-3 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => setIsSidebarCollapsed(false)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                        aria-label="Expand history sidebar"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    <div className="mb-3 flex items-center justify-center rounded-xl bg-secondary/60 p-2 text-center">
                      <div className="space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rec</p>
                        <p className="text-sm font-semibold leading-none text-foreground">{historyVideos.length}</p>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">{renderHistoryRows(true)}</div>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">History</p>
                        <p className="text-xs text-muted-foreground">{historyVideos.length} videos</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSidebarCollapsed(true)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                        aria-label="Collapse history sidebar"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                        </svg>
                      </button>
                    </div>

                    <div className="mb-3">
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search title, athlete, opponent..."
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">{renderHistoryRows(false)}</div>
                  </>
                )}
              </div>
            </aside>

            <section className="min-w-0 flex-1">
              <div className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-muted p-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("chat")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    activeTab === "chat"
                      ? "bg-background text-red-600 shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AI Coach
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("analyze")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    activeTab === "analyze"
                      ? "bg-background text-red-600 shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Video Analysis
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    activeTab === "history"
                      ? "bg-background text-red-600 shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  History Detail
                </button>
              </div>

              {activeTab === "analyze" && (
                <div className="space-y-8">
                  {!videoFile ? (
                    <div
                      className={`relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-10 text-center transition-all duration-300 md:p-16 ${
                        isDragging
                          ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                          : "border-border hover:border-red-300 dark:hover:border-red-700"
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 to-amber-50/50 opacity-50 dark:from-red-900/10 dark:to-amber-900/10" />

                      <div className="relative">
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-red-100 to-amber-100 dark:from-red-900/30 dark:to-amber-900/30">
                          <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                        </div>
                        <h3 className="mb-3 text-2xl font-bold">Drop your video here</h3>
                        <p className="mb-2 text-muted-foreground">or click to browse files</p>
                        <p className="text-sm text-muted-foreground/70">Supports MP4, MOV, AVI, WebM - Max 100MB</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                          className="hidden"
                          onChange={handleFileInputChange}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="glass-card rounded-3xl p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${getWeaponStyle(selectedWeapon).bg} shadow-lg`}
                          >
                            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                          <div>
                            <p className="text-lg font-semibold">{videoFile.name}</p>
                            <p className="text-sm text-muted-foreground">{formatFileSize(videoFile.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveVideo}
                          className="rounded-xl p-3 transition-colors hover:bg-secondary"
                        >
                          <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {(videoFile.status === "uploading" || videoFile.status === "processing") && (
                        <div className="mb-4">
                          <div className="mb-2 flex justify-between text-sm">
                            <span className="font-medium text-muted-foreground">
                              {videoFile.status === "uploading" ? "Uploading..." : "Analyzing..."}
                            </span>
                            <span className="font-semibold text-red-600">{Math.round(videoFile.progress)}%</span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500 transition-all duration-500"
                              style={{ width: `${videoFile.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {videoFile.status === "complete" && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-medium">
                              {analysisMode === "pose" ? "Pose Analysis Complete" : "Analysis Complete"}
                            </span>
                          </div>

                          {analysisMode === "pose" && poseResult && (
                            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                              <h4 className="font-semibold">Pose Analysis Results</h4>
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                                  <p className="text-xs text-muted-foreground">Total Frames</p>
                                  <p className="text-lg font-bold text-red-600">{poseResult.total_frames}</p>
                                </div>
                                <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
                                  <p className="text-xs text-muted-foreground">Processed</p>
                                  <p className="text-lg font-bold text-amber-600">{poseResult.processed_frames}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                <a
                                  href={buildAuthedApiUrl(`/video/${videoFile?.id}/pose-overlay/file`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover-lift min-w-[200px] flex-1 rounded-xl bg-gradient-to-r from-red-600 to-red-700 p-3 text-center font-medium text-white transition-all hover:shadow-lg hover:shadow-red-500/30"
                                >
                                  View Skeleton Overlay
                                </a>
                                <a
                                  href={buildAuthedApiUrl(`/video/${videoFile?.id}/pose-data`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-w-[200px] flex-1 rounded-xl bg-secondary p-3 text-center font-medium transition-colors hover:bg-secondary/80"
                                >
                                  View Pose Data
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {videoFile.status === "error" && (
                        <div className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-600 dark:bg-red-900/20">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>Upload failed. Please try again.</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid items-stretch gap-6 md:grid-cols-2">
                    <div className="glass-card flex h-full flex-col rounded-3xl p-6">
                      <div className="mb-4">
                        <h4 className="flex items-center gap-2 font-semibold">
                          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                          Analysis Mode
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">Choose how this upload is processed.</p>
                      </div>

                      <div className="space-y-3">
                        {ANALYSIS_MODES.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            onClick={() => setAnalysisMode(mode.value as AnalysisMode)}
                            disabled={mode.value === "action"}
                            className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                              analysisMode === mode.value
                                ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                                : mode.value === "action"
                                  ? "cursor-not-allowed border-border/50 opacity-60"
                                  : "border-border hover:border-red-300"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{mode.icon}</span>
                              <div>
                                <p className="font-medium">{mode.label}</p>
                                <p className="text-xs text-muted-foreground">{mode.description}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="glass-card flex h-full flex-col rounded-3xl p-6">
                      <div className="mb-4">
                        <h4 className="flex items-center gap-2 font-semibold">
                          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Weapon Type
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">Used as context for analysis and coaching prompts.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3">
                        {WEAPON_TYPES.map((weapon) => (
                          <button
                            key={weapon.value}
                            type="button"
                            onClick={() => setSelectedWeapon(weapon.value)}
                            className={`min-h-[56px] rounded-xl border-2 px-3 py-3 transition-all ${
                              selectedWeapon === weapon.value
                                ? "border-transparent shadow-lg"
                                : "border-border hover:border-red-300"
                            }`}
                            style={{
                              backgroundColor: selectedWeapon === weapon.value ? weapon.color : undefined,
                            }}
                          >
                            <span className={`font-medium ${selectedWeapon === weapon.value ? "text-white" : ""}`}>
                              {weapon.label}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-border/70 bg-background/40 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Selected profile
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${selectedWeaponStyle.bg}`} />
                          <p className="text-sm font-semibold">{selectedWeaponStyle.label}</p>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground/90">{selectedWeaponNote}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowMetadataForm(!showMetadataForm)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 transition-colors hover:border-red-300"
                  >
                    <svg
                      className={`h-5 w-5 text-muted-foreground transition-transform ${showMetadataForm ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-medium">{showMetadataForm ? "Hide" : "Show"} match details (optional)</span>
                  </button>

                  {showMetadataForm && (
                    <div className="glass-card space-y-6 rounded-3xl p-6">
                      <h4 className="text-lg font-semibold">Match Details</h4>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">Title</label>
                          <input
                            type="text"
                            value={metadata.title}
                            onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                            placeholder="e.g., 2024 Regional Championship Final"
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">Athlete</label>
                          <input
                            type="text"
                            value={metadata.athlete}
                            onChange={(e) => setMetadata({ ...metadata, athlete: e.target.value })}
                            placeholder="Your name"
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">Opponent</label>
                          <input
                            type="text"
                            value={metadata.opponent}
                            onChange={(e) => setMetadata({ ...metadata, opponent: e.target.value })}
                            placeholder="Opponent name"
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">Tournament</label>
                          <input
                            type="text"
                            value={metadata.tournament}
                            onChange={(e) => setMetadata({ ...metadata, tournament: e.target.value })}
                            placeholder="e.g., National Championships"
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">Match Result</label>
                          <select
                            value={metadata.matchResult}
                            onChange={(e) => setMetadata({ ...metadata, matchResult: e.target.value })}
                            className="w-full rounded-xl border border-border bg-background p-3"
                          >
                            <option value="">Select result</option>
                            <option value="win">Win</option>
                            <option value="loss">Loss</option>
                            <option value="draw">Draw</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">Score</label>
                          <input
                            type="text"
                            value={metadata.score}
                            onChange={(e) => setMetadata({ ...metadata, score: e.target.value })}
                            placeholder="e.g., 15-12"
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!videoFile || videoFile.status === "uploading" || videoFile.status === "processing"}
                    className="hover-lift w-full rounded-2xl bg-gradient-to-r from-red-600 to-red-700 py-5 text-lg font-semibold text-white transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
                  >
                    {videoFile?.status === "uploading"
                      ? "Uploading..."
                      : videoFile?.status === "processing"
                        ? "Analyzing..."
                        : videoFile
                          ? "Start Analysis"
                          : "Select a video to start"}
                  </button>

                  {uploadError && (
                    <div className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-600 dark:bg-red-900/20">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
                        />
                      </svg>
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "chat" && (
                <div className="flex h-[calc(100vh-140px)] min-h-[680px] flex-col">
                  <div className="glass-card mb-4 flex-1 space-y-4 overflow-y-auto rounded-3xl p-6">
                    {messages.map((message, index) => (
                      <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`rounded-2xl ${
                            message.role === "user"
                              ? "max-w-[80%] bg-gradient-to-r from-red-600 to-red-700 p-5 text-white"
                              : "max-w-[88%] bg-secondary p-5 md:max-w-[82%]"
                          }`}
                        >
                          {message.role === "user" ? (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                          ) : (
                            <ChatMarkdown content={message.content} />
                          )}
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-secondary p-5">
                          <div className="flex gap-2">
                            <span className="h-3 w-3 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
                            <span className="h-3 w-3 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                            <span className="h-3 w-3 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mb-4 rounded-2xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Context status</p>
                        {activeChatVideoId && chatContextStatus ? (
                          <div className="mt-1 space-y-1 text-sm">
                            <p className="font-semibold text-foreground">
                              Video: {chatContextStatus.video_title} ({chatContextStatus.video_id.slice(0, 8)}...)
                            </p>
                            <p className="text-muted-foreground">
                              Mode: Full Pose • Coverage: {chatContextStatus.overflow.used_frames}/
                              {chatContextStatus.overflow.original_frames} (
                              {Math.round(chatContextStatus.overflow.coverage_ratio * 100)}%)
                              {chatContextStatus.overflow.truncated ? " • Truncated" : ""}
                            </p>
                          </div>
                        ) : externalContextStatus ? (
                          <div className="mt-1 space-y-1 text-sm">
                            <p className="font-semibold text-foreground">
                              Source: {externalContextStatus.label}
                            </p>
                            <p className="text-muted-foreground">
                              Window: {externalContextStatus.window} • Sessions: {externalContextStatus.entry_count}
                              {needsExternalContextForNextSend ? " • Full context queued" : ""}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">
                            No context attached. Choose a video or jump from Training to provide grounded coaching context.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSwitchVideoFromChat}
                          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:border-red-300"
                        >
                          {activeChatVideoId ? "Switch Video" : "Choose Video Context"}
                        </button>
                        <button
                          type="button"
                          onClick={handleClearChatContext}
                          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Clear Context
                        </button>
                      </div>
                    </div>
                    {isContextPreparing && (
                      <p className="mt-3 text-xs text-muted-foreground">Preparing full pose context for this video...</p>
                    )}
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {(chatSuggestedPrompts.length ? chatSuggestedPrompts : DEFAULT_QUICK_PROMPTS).map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="rounded-full bg-secondary px-4 py-2 text-sm transition-colors hover:bg-secondary/80"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                      placeholder="Ask about fencing technique, training tips..."
                      className="flex-1 rounded-2xl border border-border bg-card p-5 text-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!input.trim() || isTyping || isContextPreparing}
                      className="hover-lift rounded-2xl bg-gradient-to-r from-red-600 to-red-700 px-8 py-5 font-semibold text-white transition-all duration-300 hover:shadow-lg hover:shadow-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "history" && (
                <div className="space-y-5">
                  {!selectedHistoryVideoId && (
                    <div className="glass-card rounded-3xl border border-dashed border-border p-8 text-center">
                      <h3 className="mb-2 text-xl font-semibold">Select a history record</h3>
                      <p className="text-muted-foreground">
                        Choose a video from the left sidebar to view pose analysis and report details here.
                      </p>
                    </div>
                  )}

                  {selectedHistoryVideoId && historyDetailLoading && (
                    <div className="glass-card rounded-3xl p-8">
                      <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
                          <p className="text-sm text-muted-foreground">Loading history detail...</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedHistoryVideoId && !historyDetailLoading && historyDetailError && (
                    <div className="rounded-3xl border border-red-200 bg-red-50/80 p-6 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                      <p>{historyDetailError}</p>
                      <button
                        type="button"
                        onClick={() => void loadHistoryDetail(selectedHistoryVideoId)}
                        className="mt-3 rounded-xl border border-red-300 px-3 py-1.5 text-sm font-semibold hover:bg-red-100"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {selectedHistoryVideoId && !historyDetailLoading && !historyDetailError && historyDetail && (
                    <>
                      <div className="glass-card rounded-3xl p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Selected Match</p>
                            <h2 className="mt-1 text-2xl font-bold">{historyDetail.title || "Untitled Video"}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Uploaded {formatRelativeTime(historyDetail.upload_time)}
                            </p>
                          </div>
                          <span
                            className="rounded-full px-3 py-1 text-sm font-semibold"
                            style={{
                              backgroundColor: `${getWeaponColor(historyDetail.weapon)}20`,
                              color: getWeaponColor(historyDetail.weapon),
                            }}
                          >
                            {getWeaponLabel(historyDetail.weapon)}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Athlete</p>
                            <p className="mt-1 font-semibold">{historyDetail.athlete || "Unknown"}</p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Opponent</p>
                            <p className="mt-1 font-semibold">{historyDetail.opponent || "Unknown"}</p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tournament</p>
                            <p className="mt-1 font-semibold">{historyDetail.tournament || "Not set"}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {getResultLabel(historyDetail.match_result) && (
                            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                              Result: {getResultLabel(historyDetail.match_result)}
                            </span>
                          )}
                          {historyDetail.score && (
                            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs text-secondary-foreground">
                              Score: {historyDetail.score}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="glass-card rounded-3xl p-6">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold">AI Analysis Report</h3>
                          {historyPoseData && !historyReportLoading && (
                            <button
                              type="button"
                              onClick={handleGenerateHistoryReport}
                              className="rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 text-sm font-semibold text-white"
                            >
                              {historyReport ? "Regenerate Report" : "Generate Report"}
                            </button>
                          )}
                        </div>

                        {historyReportLoading && (
                          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                            <p className="text-sm text-muted-foreground">Generating report...</p>
                          </div>
                        )}

                        {historyReportError && (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20">
                            {historyReportError}
                          </div>
                        )}

                        {historyReport && (
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full bg-secondary px-2.5 py-1">
                                {historyReport.cached ? "Cached report" : "Saved report"}
                              </span>
                              <span>Updated {formatRelativeTime(historyReport.updated_at)}</span>
                            </div>
                            <ReportMarkdown content={historyReport.report} summary={historyReport.summary} />
                          </div>
                        )}

                        {!historyReport && !historyReportLoading && !historyReportError && !historyPoseData && (
                          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                            No pose data available for this video yet. Run pose analysis first.
                          </div>
                        )}
                      </div>

                      <div className="glass-card rounded-3xl p-6">
                        <h3 className="mb-4 text-lg font-semibold">Quick Actions</h3>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={handleAskAiAboutHistory}
                            className="rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Ask AI About This Match
                          </button>
                          <Link
                            href={`/history/${selectedHistoryVideoId}`}
                            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:border-red-300"
                          >
                            Open Full History Page
                          </Link>
                          <a
                            href={buildAuthedApiUrl(`/video/${selectedHistoryVideoId}/pose-data`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:border-red-300"
                          >
                            Open Pose Data
                          </a>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Close history drawer"
          />

          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col border-r border-border bg-background p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">History</p>
                <p className="text-xs text-muted-foreground">{historyVideos.length} videos</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">{renderHistoryRows(false)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-foreground pt-32">
          <div className="mx-auto max-w-5xl px-6">
            <div className="h-10 w-60 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      }
    >
      <AnalyzeContent />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  ANALYSIS_REPORT_UPDATED_EVENT,
  clearCachedAnalysisReports,
  ensureAnalysisReport,
  parseAnalysisReportCacheKey,
  readCachedAnalysisReport,
  resumeLatestAnalysisReportJob,
  startAnalysisReportJob,
  waitForAnalysisReportJob,
} from "@/lib/analysis-report";
import {
  startPoseAnalysisJob,
  waitForPoseAnalysisJob,
  type PoseAnalysisResult,
} from "@/lib/pose-analysis-job";
import { authFetch } from "@/lib/api";
import {
  SESSION_META,
  SESSION_TYPE_CHAT,
  SESSION_TYPE_TRAINING,
  SESSION_TYPE_VIDEO,
  type SessionType,
  normalizeSessionType,
} from "@/lib/chat-session";
import {
  getAthleteSlotLabel,
  getAthleteSlotShortLabel,
  getAvailableAthleteSlots,
  getDefaultAthleteSlot,
  getSlotPoseFrames,
  hasDualAthletePose,
  type AthleteSlot,
  type PoseData,
} from "@/lib/pose-data";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ReportMarkdown } from "@/components/report-markdown";
import { TopNav } from "@/components/top-nav";
import { useAppDialog } from "@/components/app-dialog-provider";
import { useLocale } from "@/lib/locale";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: CitationRecord[];
  retrievalMeta?: RetrievalMetaRecord | null;
}

interface CitationRecord {
  chunk_id: string;
  doc_id: string;
  title: string;
  source: string;
  snippet: string;
  score: number;
}

interface RetrievalMetaRecord {
  use_kb: boolean;
  provider?: string | null;
  collection?: string | null;
  hit_count: number;
  degraded: boolean;
  degrade_reason?: string | null;
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
  upload_status?: string;
  report_status?: string;
}

interface AnalysisReportRecord {
  report_id: string;
  video_id: string;
  athlete_slot?: AthleteSlot | null;
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
  athlete_slot: AthleteSlot;
  mode: "full_pose";
  overflow: OverflowMeta;
  updated_at: string;
}

interface ChatContextPack {
  video_id: string;
  athlete_slot: AthleteSlot;
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
  session_id?: string | null;
  messages: Message[];
  context_summary: string;
  context_status: ContextStatusMeta | null;
  suggested_prompts: string[];
  needs_full_context: boolean;
  updated_at: string;
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

interface ChatSessionMessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationRecord[] | null;
  retrieval_meta?: RetrievalMetaRecord | null;
  created_at: string;
}

interface ChatSessionDetailRecord extends ChatSessionRecord {
  messages: ChatSessionMessageRecord[];
}

interface ChatSessionDeleteResponse {
  deleted_scope: "session_only" | "video_full";
  deleted_session_count: number;
  deleted_message_count: number;
  video_id?: string | null;
  message: string;
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
  items: ChatSessionRecord[];
}

const SIDEBAR_STORAGE_KEY = "engarde.analyze.historySidebarCollapsed";
const VIDEO_SESSION_STORAGE_PREFIX = "video_qa_session:";
const TRAINING_HANDOFF_STORAGE_KEY = "engarde.training.handoff";
const MAX_SESSION_MESSAGES = 30;
const MAX_SESSION_VIDEOS = 20;
const MAX_BACKEND_SESSION_MESSAGES = 80;
// Keep the browser-side context pack roughly aligned with the backend safety
// budget for MiniMax M2.7 instead of the previous 20k-char bottleneck.
const MAX_CONTEXT_CHARS = 180000;
const TARGET_CONTEXT_FRAMES = 480;
const MIN_CONTEXT_FRAMES = 96;
const CONTEXT_POSE_MAX_FRAMES = 560;
const MAX_REPORT_EXCERPT_CHARS = 2400;

const DEFAULT_CHAT_OPENING_EN =
  "Hi! I'm your fencing AI coach. Ask me anything about technique, training, or analyze your videos. How can I help you today?";
const DEFAULT_CHAT_OPENING_ZH =
  "你好！我是你的击剑 AI 教练。你可以问我技术、训练或视频分析相关问题。现在想先聊哪一部分？";

const DEFAULT_QUICK_PROMPTS_EN = [
  "How to improve my lunge?",
  "What are common footwork mistakes?",
  "How to defend against attacks?",
  "What is a good weekly training routine?",
];
const DEFAULT_QUICK_PROMPTS_ZH = [
  "我该如何改进弓步？",
  "常见的步法错误有哪些？",
  "面对进攻时如何防守更稳？",
  "一周训练安排怎么做更合理？",
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
  {
    value: "pose",
    labelEn: "Pose Detection",
    labelZh: "姿态检测",
    descriptionEn: "See body posture and movement throughout the bout.",
    descriptionZh: "查看整段对抗中的身体姿态与移动轨迹。",
    icon: "🦴",
  },
  {
    value: "action",
    labelEn: "Action Recognition",
    labelZh: "动作识别",
    descriptionEn: "Identify key fencing actions automatically (Coming Soon).",
    descriptionZh: "自动识别关键击剑动作（即将上线）。",
    icon: "🎯",
  },
];

const WEAPON_TYPES = [
  { value: "foil", label: "Foil", color: "#F97316", bg: "bg-orange-500" },
  { value: "epee", label: "Epee", color: "#DC2626", bg: "bg-red-600" },
  { value: "sabre", label: "Sabre", color: "#06B6D4", bg: "bg-cyan-500" },
];

const WEAPON_TYPE_NOTES_EN: Record<string, string> = {
  foil: "Emphasizes right-of-way timing, blade control, and clean point line entries.",
  epee: "Prioritizes distance management, counter-time, and single-light risk control.",
  sabre: "Focuses on explosive first actions, tempo shifts, and compact recovery steps.",
};
const WEAPON_TYPE_NOTES_ZH: Record<string, string> = {
  foil: "重点关注优先权时机、剑尖控制和清晰的刺入线路。",
  epee: "更强调距离管理、反时机处理和单灯风险控制。",
  sabre: "关注爆发式先手、节奏变化和紧凑的还原步。",
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
  const slotLabel = report.athlete_slot ? getAthleteSlotLabel(report.athlete_slot) : "";
  if (summary && body) {
    return `${slotLabel ? `Athlete Slot: ${slotLabel}\n` : ""}Summary: ${summary}\n\n${body}`;
  }
  const merged = summary || body || "";
  return slotLabel && merged ? `Athlete Slot: ${slotLabel}\n${merged}` : merged;
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

const formatRelativeTime = (dateString: string, isZh = false) => {
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

const getWeaponLabel = (weapon: string, isZh = false) => {
  const labels: Record<string, string> = {
    foil: isZh ? "花剑" : "Foil",
    epee: isZh ? "重剑" : "Epee",
    sabre: isZh ? "佩剑" : "Sabre",
  };
  return labels[weapon?.toLowerCase()] || weapon || (isZh ? "未知" : "Unknown");
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

const toUiMessage = (
  message: Pick<ChatSessionMessageRecord, "role" | "content" | "citations" | "retrieval_meta">,
): Message => ({
  role: message.role,
  content: message.content,
  citations: Array.isArray(message.citations) ? message.citations : undefined,
  retrievalMeta: message.retrieval_meta ?? null,
});

const getSessionDotColor = (sessionType: SessionType) => {
  if (sessionType === SESSION_TYPE_VIDEO) return "#3B82F6";
  if (sessionType === SESSION_TYPE_TRAINING) return "#F97316";
  return "#22C55E";
};

const getWeaponColor = (weapon: string) => {
  const colors: Record<string, string> = {
    foil: "#F97316",
    epee: "#DC2626",
    sabre: "#06B6D4",
  };
  return colors[weapon?.toLowerCase()] || "#6B7280";
};

const getResultLabel = (matchResult: string, isZh = false) => {
  const result = matchResult?.toLowerCase();
  if (result === "win") return isZh ? "胜" : "Win";
  if (result === "loss") return isZh ? "负" : "Loss";
  if (result === "draw") return isZh ? "平" : "Draw";
  return "";
};

function AnalyzeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, alert } = useAppDialog();
  const { isZh } = useLocale();
  const t = useCallback(
    (zh: string, en: string) => (isZh ? zh : en),
    [isZh],
  );
  const defaultChatOpening = isZh ? DEFAULT_CHAT_OPENING_ZH : DEFAULT_CHAT_OPENING_EN;
  const defaultQuickPrompts = useMemo(
    () => (isZh ? DEFAULT_QUICK_PROMPTS_ZH : DEFAULT_QUICK_PROMPTS_EN),
    [isZh],
  );

  const [activeTab, setActiveTab] = useState<AnalyzeTab>("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: defaultChatOpening,
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
  const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>([]);
  const [chatSessionsLoading, setChatSessionsLoading] = useState(true);
  const [chatSessionsError, setChatSessionsError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");

  const [selectedHistoryVideoId, setSelectedHistoryVideoId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<HistoryItem | null>(null);
  const [historyPoseData, setHistoryPoseData] = useState<PoseData | null>(null);
  const [selectedHistoryAthleteSlot, setSelectedHistoryAthleteSlot] = useState<AthleteSlot>("left");
  const [historyReport, setHistoryReport] = useState<AnalysisReportRecord | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [historyReportLoading, setHistoryReportLoading] = useState(false);
  const [historyReportAction, setHistoryReportAction] = useState<"load" | "generate" | null>(null);
  const [historyReportError, setHistoryReportError] = useState<string | null>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  const [hasHandledSearchParamVideo, setHasHandledSearchParamVideo] = useState(false);
  const [hasHandledTrainingHandoff, setHasHandledTrainingHandoff] = useState(false);
  const [pendingAutoQuestion, setPendingAutoQuestion] = useState<string | null>(null);
  const [pendingQueuedMessage, setPendingQueuedMessage] = useState<string | null>(null);
  const [activeChatVideoId, setActiveChatVideoId] = useState<string | null>(null);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [chatContextPack, setChatContextPack] = useState<ChatContextPack | null>(null);
  const [chatContextSummary, setChatContextSummary] = useState("");
  const [chatContextStatus, setChatContextStatus] = useState<ContextStatusMeta | null>(null);
  const [externalContextPayload, setExternalContextPayload] = useState<string | null>(null);
  const [externalContextSummary, setExternalContextSummary] = useState("");
  const [externalContextStatus, setExternalContextStatus] = useState<ExternalContextStatus | null>(null);
  const [needsExternalContextForNextSend, setNeedsExternalContextForNextSend] = useState(false);
  const [chatSuggestedPrompts, setChatSuggestedPrompts] = useState<string[]>(defaultQuickPrompts);
  const [needsFullContextForNextSend, setNeedsFullContextForNextSend] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [isDraftChatSession, setIsDraftChatSession] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionSwitchRef = useRef(0);
  const chatSessionSwitchRef = useRef(0);
  const historyDetailRequestRef = useRef(0);
  const contextTransitionRef = useRef(0);
  const pendingUrlSessionIdRef = useRef<string | null>(null);
  const suppressUrlSessionRestoreRef = useRef(false);
  const processingProgressTimerRef = useRef<number | null>(null);
  const hasInitializedDefaultSessionRef = useRef(false);
  const selectedHistoryVideoIdRef = useRef<string | null>(null);
  const activeChatVideoIdRef = useRef<string | null>(null);
  const activeChatSessionIdRef = useRef<string | null>(null);
  const historyDetailAbortRef = useRef<AbortController | null>(null);
  const activeStreamAbortRef = useRef<AbortController | null>(null);
  const activeStreamIdRef = useRef(0);

  const beginContextTransition = useCallback(() => {
    const transitionId = contextTransitionRef.current + 1;
    contextTransitionRef.current = transitionId;
    setIsContextPreparing(true);
    return transitionId;
  }, []);

  const cancelActiveChatStream = useCallback((options?: { resetTyping?: boolean }) => {
    activeStreamIdRef.current += 1;
    if (activeStreamAbortRef.current) {
      activeStreamAbortRef.current.abort();
      activeStreamAbortRef.current = null;
    }
    if (options?.resetTyping) {
      setIsTyping(false);
    }
  }, []);

  const cancelHistoryDetailRequest = useCallback(() => {
    if (historyDetailAbortRef.current) {
      historyDetailAbortRef.current.abort();
      historyDetailAbortRef.current = null;
    }
  }, []);

  const historyAthleteSlots = useMemo(
    () => getAvailableAthleteSlots(historyPoseData),
    [historyPoseData],
  );
  const hasDualHistoryAthletes = useMemo(
    () => hasDualAthletePose(historyPoseData),
    [historyPoseData],
  );

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

  useEffect(() => {
    return () => {
      cancelActiveChatStream();
      cancelHistoryDetailRequest();
    };
  }, [cancelActiveChatStream, cancelHistoryDetailRequest]);

  useEffect(() => {
    selectedHistoryVideoIdRef.current = selectedHistoryVideoId;
  }, [selectedHistoryVideoId]);

  useEffect(() => {
    activeChatVideoIdRef.current = activeChatVideoId;
  }, [activeChatVideoId]);

  useEffect(() => {
    activeChatSessionIdRef.current = activeChatSessionId;
  }, [activeChatSessionId]);

  const extractPoseFrames = useCallback((poseData: PoseData | null, athleteSlot: AthleteSlot) => {
    const slotFrames = getSlotPoseFrames(poseData, athleteSlot);
    if (!slotFrames.length) return [] as ChatContextPack["pose_frames"];

    return slotFrames
      .map((frame) => {
        const landmarks = Array.isArray(frame.landmarks) ? frame.landmarks : [];
        const visibilityArray = Array.isArray(frame.visibility) ? frame.visibility : [];

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
          frame_index: safeNumber(frame.frame_index),
          timestamp: frame.timestamp !== undefined
            ? roundTo(safeNumber(frame.timestamp), 2)
            : null,
          key_points: keyPoints,
        };
      })
      .filter((frame) => Object.keys(frame.key_points).length > 0);
  }, []);

  const buildContextSummary = useCallback(
    (video: HistoryItem, athleteSlot: AthleteSlot, reportExcerpt: string, overflow: OverflowMeta) => {
      const summaryLines = [
        `Video: ${video.title || (isZh ? "未命名" : "Untitled")} (${getWeaponLabel(video.weapon, isZh)})`,
        `Athlete Slot: ${getAthleteSlotLabel(athleteSlot)}`,
        `Athlete/Opponent: ${video.athlete || "Unknown"} / ${video.opponent || "Unknown"}`,
        `Tournament: ${video.tournament || (isZh ? "未设置" : "Not set")} | Score: ${video.score || "N/A"} | Result: ${getResultLabel(video.match_result, isZh) || "N/A"}`,
      ];

      summaryLines.push(
        `Pose coverage: ${overflow.used_frames}/${overflow.original_frames} frames (${Math.round(overflow.coverage_ratio * 100)}%)`,
      );

      if (reportExcerpt) {
        summaryLines.push(`Report excerpt: ${reportExcerpt.slice(0, 420)}`);
      }

      return summaryLines.join("\n");
    },
    [isZh],
  );

  const buildSuggestedPrompts = useCallback((video: HistoryItem) => {
    const weaponLabel = getWeaponLabel(video.weapon, isZh);
    const title = video.title || "this bout";

    return [
      `For ${title}, what are my top 3 priority fixes?`,
      `Design a 20-minute ${weaponLabel} drill plan based on this video.`,
      "Which movement pattern causes most of my defensive risk?",
      "Give me cue words to remember before my next point.",
    ];
  }, [isZh]);

  const buildContextArtifacts = useCallback(
    (
      video: HistoryItem,
      poseData: PoseData | null,
      athleteSlot: AthleteSlot,
      reportText: string,
    ): {
      contextPack: ChatContextPack;
      contextString: string;
      contextSummary: string;
      contextStatus: ContextStatusMeta;
      suggestedPrompts: string[];
    } => {
      const allFrames = extractPoseFrames(poseData, athleteSlot);
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
        athlete_slot: athleteSlot,
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
      const contextSummary = buildContextSummary(video, athleteSlot, reportExcerpt, overflow);
      const contextStatus: ContextStatusMeta = {
        video_id: video.video_id,
        video_title: video.title || "Untitled",
        athlete_slot: athleteSlot,
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
      sessionId: string | null,
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
        session_id: sessionId,
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

  const resolveBackendChatSession = useCallback(
    async (options?: {
      videoId?: string | null;
      sessionType?: SessionType;
      forceNew?: boolean;
      title?: string;
      contextSummary?: string;
    }): Promise<ChatSessionRecord | null> => {
      const videoId = options?.videoId?.trim() || null;
      const sessionType = options?.sessionType || (videoId ? SESSION_TYPE_VIDEO : SESSION_TYPE_CHAT);

      if (!options?.forceNew) {
        const query = new URLSearchParams({ limit: "1", session_type: sessionType });
        if (videoId) {
          query.set("video_id", videoId);
        }
        const listResponse = await authFetch(`/chat/sessions?${query.toString()}`);
        if (listResponse.ok) {
          const listData = (await listResponse.json()) as { sessions?: ChatSessionRecord[] };
          const existing = listData.sessions?.[0];
          if (existing) {
            return existing;
          }
        }
      }

      const createResponse = await authFetch("/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          session_type: sessionType,
          title: options?.title || null,
          context_summary: options?.contextSummary || null,
          force_new: Boolean(options?.forceNew),
        }),
      });
      if (!createResponse.ok) {
        return null;
      }
      return (await createResponse.json()) as ChatSessionRecord;
    },
    [],
  );

  const listBackendChatSessions = useCallback(
    async (options?: {
      sessionType?: SessionType;
      limit?: number;
    }): Promise<ChatSessionRecord[]> => {
      const query = new URLSearchParams({
        limit: String(options?.limit ?? 20),
      });
      if (options?.sessionType) {
        query.set("session_type", options.sessionType);
      }
      const response = await authFetch(`/chat/sessions?${query.toString()}`);
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as { sessions?: ChatSessionRecord[] };
      return data.sessions || [];
    },
    [],
  );

  const fetchChatSessions = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        if (!options?.silent) {
          setChatSessionsLoading(true);
        }
        const sessions = await listBackendChatSessions({ limit: 100 });
        setChatSessions(sessions);
        setChatSessionsError(null);
      } catch (err) {
        setChatSessionsError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        if (!options?.silent) {
          setChatSessionsLoading(false);
        }
      }
    },
    [listBackendChatSessions],
  );

  const syncAnalyzeSessionUrl = useCallback(
    (sessionId: string | null) => {
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);
      if (sessionId) {
        params.set("chat_session", sessionId);
      } else {
        params.delete("chat_session");
      }
      params.delete("video");
      params.delete("training_context");

      const nextQuery = params.toString();
      const currentQuery = window.location.search.startsWith("?")
        ? window.location.search.slice(1)
        : window.location.search;

      if (nextQuery === currentQuery) return;
      router.replace(nextQuery ? `/analyze?${nextQuery}` : "/analyze", { scroll: false });
    },
    [router],
  );

  const loadBackendChatSessionDetail = useCallback(async (sessionId: string): Promise<ChatSessionDetailRecord | null> => {
    if (!sessionId) return null;

    const response = await authFetch(`/chat/sessions/${sessionId}?limit=${MAX_BACKEND_SESSION_MESSAGES}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ChatSessionDetailRecord;
  }, []);

  const activateChatSessionById = useCallback(
    async (sessionId: string, options?: { switchToChat?: boolean }) => {
      if (!sessionId) return;
      cancelActiveChatStream({ resetTyping: true });
      cancelHistoryDetailRequest();
      const switchId = chatSessionSwitchRef.current + 1;
      const transitionId = beginContextTransition();
      chatSessionSwitchRef.current = switchId;
      pendingUrlSessionIdRef.current = sessionId;
      syncAnalyzeSessionUrl(sessionId);
      setSessionHydrated(false);
      setIsDraftChatSession(false);
      setPendingQueuedMessage(null);
      setExternalContextPayload(null);
      setExternalContextSummary("");
      setExternalContextStatus(null);
      setNeedsExternalContextForNextSend(false);

      try {
        const detail = await loadBackendChatSessionDetail(sessionId);
        if (switchId !== chatSessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;
        if (!detail) {
          throw new Error("Failed to load chat session");
        }

        const restoredMessages: Message[] = detail.messages?.length
          ? detail.messages
              .filter((item) => item.role === "user" || item.role === "assistant")
              .map((item) => toUiMessage(item))
          : [{ role: "assistant", content: defaultChatOpening }];

        setMessages(restoredMessages);
        setActiveChatSessionId(detail.id);
        setActiveChatVideoId(detail.video_id || null);

        if (detail.video_id) {
          const videoResponse = await authFetch(`/video/${detail.video_id}`);
          if (switchId !== chatSessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;
          if (!videoResponse.ok) {
            throw new Error("Failed to fetch linked video context");
          }
          const video = (await videoResponse.json()) as HistoryItem;
          let pose: PoseData | null = null;
          let report: AnalysisReportRecord | null = null;

          try {
            const poseResponse = await authFetch(`/video/${detail.video_id}/pose-data`);
            if (switchId !== chatSessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;
            if (poseResponse.ok) {
              pose = (await poseResponse.json()) as PoseData;
            }
          } catch {
            pose = null;
          }

          try {
            if (pose) {
              report = await ensureAnalysisReport<AnalysisReportRecord>(detail.video_id, {
                athleteSlot: getDefaultAthleteSlot(pose),
                generateIfMissing: false,
              });
              if (switchId !== chatSessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;
            }
          } catch {
            report = null;
          }

          const contextData = { video, pose, report };
          const reportText = buildReportContextText(contextData.report);
          const contextAthleteSlot = contextData.report?.athlete_slot ?? getDefaultAthleteSlot(contextData.pose);

          historyDetailRequestRef.current += 1;
          setSelectedHistoryVideoId(detail.video_id);
          setHistoryDetail(contextData.video);
          setHistoryPoseData(contextData.pose);
          setSelectedHistoryAthleteSlot(contextAthleteSlot);
          setHistoryReport(contextData.report);
          setHistoryDetailLoading(false);
          setHistoryReportLoading(false);
          setHistoryReportAction(null);
          setHistoryDetailError(null);
          setHistoryReportError(null);

          const artifacts = buildContextArtifacts(
            contextData.video,
            contextData.pose,
            contextAthleteSlot,
            reportText,
          );

          setChatContextSummary(artifacts.contextSummary);
          setChatContextStatus(artifacts.contextStatus);
          setChatSuggestedPrompts(artifacts.suggestedPrompts);
          setNeedsFullContextForNextSend(true);
          setChatContextPack(null);
          persistVideoSession(
            detail.video_id,
            detail.id,
            restoredMessages,
            artifacts.contextSummary,
            artifacts.contextStatus,
            artifacts.suggestedPrompts,
            true,
          );
        } else {
          setChatContextSummary(detail.context_summary || "");
          setChatContextStatus(null);
          setChatSuggestedPrompts(defaultQuickPrompts);
          setNeedsFullContextForNextSend(false);
          setChatContextPack(null);
          setSelectedHistoryVideoId(null);
          setHistoryDetail(null);
          setHistoryPoseData(null);
          setHistoryReport(null);
          setHistoryDetailLoading(false);
          setHistoryReportLoading(false);
          setHistoryReportAction(null);
          setHistoryDetailError(null);
          setHistoryReportError(null);
        }

        setSessionHydrated(true);
        pendingUrlSessionIdRef.current = null;
        syncAnalyzeSessionUrl(detail.id);
        void fetchChatSessions({ silent: true });
        if (options?.switchToChat) {
          setActiveTab("chat");
        }
      } catch {
        if (switchId !== chatSessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;
        let fallbackDetail: ChatSessionDetailRecord | null = null;
        try {
          const fallbackSessions = await listBackendChatSessions({ limit: 20 });
          const fallbackSession =
            fallbackSessions.find((session) => !session.video_id && session.session_type !== SESSION_TYPE_VIDEO) ||
            fallbackSessions.find((session) => !session.video_id) ||
            fallbackSessions[0];
          if (fallbackSession?.id) {
            fallbackDetail = await loadBackendChatSessionDetail(fallbackSession.id);
          }
        } catch {
          fallbackDetail = null;
        }

        if (fallbackDetail) {
          const fallbackMessages: Message[] = fallbackDetail.messages?.length
            ? fallbackDetail.messages
                .filter((item) => item.role === "user" || item.role === "assistant")
                .map((item) => toUiMessage(item))
            : [{ role: "assistant", content: defaultChatOpening }];

          setMessages([
            {
              role: "assistant",
              content: "Requested session is unavailable. Switched to your latest available thread.",
            },
            ...fallbackMessages,
          ]);
          setActiveChatSessionId(fallbackDetail.id);
          setActiveChatVideoId(fallbackDetail.video_id || null);
          setChatContextPack(null);
          setChatContextSummary(fallbackDetail.context_summary || "");
          setChatContextStatus(null);
          setChatSuggestedPrompts(defaultQuickPrompts);
          setNeedsFullContextForNextSend(false);
          setIsDraftChatSession(false);
          setSessionHydrated(true);
          pendingUrlSessionIdRef.current = null;
          syncAnalyzeSessionUrl(fallbackDetail.id);
          void fetchChatSessions({ silent: true });
          if (options?.switchToChat) {
            setActiveTab("chat");
          }
          return;
        }

        setMessages([
          {
            role: "assistant",
            content:
              "Requested session is unavailable. Started a default chat thread.\n\n" +
              defaultChatOpening,
          },
        ]);
        setActiveChatVideoId(null);
        setActiveChatSessionId(null);
        setChatContextPack(null);
        setChatContextSummary("");
        setChatContextStatus(null);
        setChatSuggestedPrompts(defaultQuickPrompts);
        setNeedsFullContextForNextSend(false);
        setIsDraftChatSession(true);
        setSessionHydrated(true);
        pendingUrlSessionIdRef.current = null;
        syncAnalyzeSessionUrl(null);
        void fetchChatSessions({ silent: true });
      } finally {
        if (pendingUrlSessionIdRef.current === sessionId) {
          pendingUrlSessionIdRef.current = null;
        }
        if (switchId === chatSessionSwitchRef.current && transitionId === contextTransitionRef.current) {
          setIsContextPreparing(false);
        }
      }
    },
    [
      beginContextTransition,
      buildContextArtifacts,
      cancelActiveChatStream,
      cancelHistoryDetailRequest,
      defaultChatOpening,
      defaultQuickPrompts,
      fetchChatSessions,
      listBackendChatSessions,
      loadBackendChatSessionDetail,
      persistVideoSession,
      syncAnalyzeSessionUrl,
    ],
  );

  const activateGeneralChatSession = useCallback(
    async (options?: {
      forceNew?: boolean;
      switchToChat?: boolean;
      sessionType?: SessionType;
      title?: string;
      contextSummary?: string;
    }) => {
      cancelActiveChatStream({ resetTyping: true });
      cancelHistoryDetailRequest();
      let requestedSessionId: string | null = null;
      const transitionId = beginContextTransition();
      setActiveChatVideoId(null);
      setSelectedHistoryVideoId(null);
      setHistoryDetail(null);
      setHistoryPoseData(null);
      setHistoryReport(null);
      setHistoryDetailError(null);
      setHistoryReportError(null);
      setExternalContextPayload(null);
      setExternalContextSummary("");
      setExternalContextStatus(null);
      setNeedsExternalContextForNextSend(false);
      setSessionHydrated(false);
      setIsDraftChatSession(false);
      setPendingQueuedMessage(null);

      try {
        const resolved = await resolveBackendChatSession({
          sessionType: options?.sessionType || SESSION_TYPE_CHAT,
          forceNew: Boolean(options?.forceNew),
          title: options?.title || "Assistant Chat",
          contextSummary: options?.contextSummary || "",
        });
        if (transitionId !== contextTransitionRef.current) return;
        requestedSessionId = resolved?.id || null;
        pendingUrlSessionIdRef.current = requestedSessionId;
        syncAnalyzeSessionUrl(requestedSessionId);
        const detail = requestedSessionId ? await loadBackendChatSessionDetail(requestedSessionId) : null;
        if (transitionId !== contextTransitionRef.current) return;
        const nextMessages: Message[] =
          detail?.messages?.length
            ? detail.messages
                .filter((item) => item.role === "user" || item.role === "assistant")
                .map((item) => toUiMessage(item))
            : [{ role: "assistant", content: defaultChatOpening }];

        setMessages(nextMessages);
        setActiveChatSessionId(requestedSessionId);
        setChatContextPack(null);
        setChatContextStatus(null);
        setChatContextSummary(detail?.context_summary || options?.contextSummary || "");
        setChatSuggestedPrompts(defaultQuickPrompts);
        setNeedsFullContextForNextSend(false);
        setIsDraftChatSession(false);
        setSessionHydrated(true);
        pendingUrlSessionIdRef.current = null;
        syncAnalyzeSessionUrl(requestedSessionId);
        void fetchChatSessions({ silent: true });

        if (options?.switchToChat) {
          setActiveTab("chat");
        }
      } finally {
        if (pendingUrlSessionIdRef.current === requestedSessionId) {
          pendingUrlSessionIdRef.current = null;
        }
        if (transitionId === contextTransitionRef.current) {
          setIsContextPreparing(false);
        }
      }
    },
    [
      beginContextTransition,
      cancelActiveChatStream,
      cancelHistoryDetailRequest,
      defaultChatOpening,
      defaultQuickPrompts,
      fetchChatSessions,
      loadBackendChatSessionDetail,
      resolveBackendChatSession,
      syncAnalyzeSessionUrl,
    ],
  );

  const fetchHistoryVideos = useCallback(async () => {
    try {
      const response = await authFetch("/video/list");
      if (!response.ok) {
        throw new Error("Failed to fetch videos");
      }
      const data = await response.json();
      const videos = Array.isArray(data.videos) ? (data.videos as HistoryItem[]) : [];
      setHistoryVideos(
        videos.filter((item) => {
          const status = (item.upload_status || "").trim().toLowerCase();
          return !status || status === "uploaded";
        }),
      );
    } catch {
      // Keep previous video list on transient failures.
    }
  }, []);

  const fetchVideoContextData = useCallback(
    async (
      videoId: string,
      athleteSlot?: AthleteSlot,
      signal?: AbortSignal,
    ): Promise<{ video: HistoryItem; pose: PoseData | null; report: AnalysisReportRecord | null }> => {
      const isAbortError = (error: unknown) =>
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");
      const throwIfAborted = () => {
        if (signal?.aborted) {
          throw new DOMException("History detail request aborted", "AbortError");
        }
      };

      throwIfAborted();
      const videoResponse = await authFetch(`/video/${videoId}`, { signal });
      throwIfAborted();
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch video details");
      }
      const video = (await videoResponse.json()) as HistoryItem;
      throwIfAborted();

      let pose: PoseData | null = null;
      let report: AnalysisReportRecord | null = null;

      try {
        const poseResponse = await authFetch(
          `/video/${videoId}/pose-data?max_frames=${CONTEXT_POSE_MAX_FRAMES}`,
          { signal },
        );
        throwIfAborted();
        if (poseResponse.ok) {
          pose = (await poseResponse.json()) as PoseData;
          throwIfAborted();
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        pose = null;
      }

      try {
        if (pose) {
          const resolvedSlot = athleteSlot ?? getDefaultAthleteSlot(pose);
          report = await ensureAnalysisReport<AnalysisReportRecord>(videoId, {
            athleteSlot: resolvedSlot,
            generateIfMissing: false,
          });
          throwIfAborted();
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        report = null;
      }

      return { video, pose, report };
    },
    [],
  );

  const loadHistoryDetail = useCallback(
    async (
      videoId: string,
      athleteSlot?: AthleteSlot,
    ): Promise<{ video: HistoryItem; pose: PoseData | null; report: AnalysisReportRecord | null } | null> => {
      const isAbortError = (error: unknown) =>
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");
      cancelHistoryDetailRequest();
      const abortController = new AbortController();
      historyDetailAbortRef.current = abortController;

      const requestId = historyDetailRequestRef.current + 1;
      historyDetailRequestRef.current = requestId;
      const isCurrentRequest = () =>
        requestId === historyDetailRequestRef.current && !abortController.signal.aborted;
      try {
        setHistoryDetailLoading(true);
        setHistoryDetailError(null);
        setHistoryReportError(null);
        setHistoryReport(readCachedAnalysisReport<AnalysisReportRecord>(videoId, athleteSlot));

        const contextData = await fetchVideoContextData(videoId, athleteSlot, abortController.signal);
        if (!isCurrentRequest()) {
          return null;
        }
        const resolvedSlot = athleteSlot ?? getDefaultAthleteSlot(contextData.pose);
        setHistoryDetail(contextData.video);
        setHistoryPoseData(contextData.pose);
        setSelectedHistoryAthleteSlot(resolvedSlot);
        setHistoryReport(contextData.report);
        return contextData;
      } catch (err) {
        if (isAbortError(err) || !isCurrentRequest()) {
          return null;
        }
        setHistoryDetailError(err instanceof Error ? err.message : "Failed to load history detail");
        setHistoryDetail(null);
        setHistoryPoseData(null);
        setSelectedHistoryAthleteSlot("left");
        setHistoryReport(null);
        return null;
      } finally {
        if (requestId === historyDetailRequestRef.current) {
          setHistoryDetailLoading(false);
        }
        if (historyDetailAbortRef.current === abortController) {
          historyDetailAbortRef.current = null;
        }
      }
    },
    [cancelHistoryDetailRequest, fetchVideoContextData],
  );

  useEffect(() => {
    if (!selectedHistoryVideoId || !historyPoseData) {
      return;
    }

    const fallbackSlot = getDefaultAthleteSlot(historyPoseData);
    if (historyAthleteSlots.length && !historyAthleteSlots.includes(selectedHistoryAthleteSlot)) {
      setSelectedHistoryAthleteSlot(fallbackSlot);
      return;
    }

    if (
      historyReport &&
      historyReport.video_id === selectedHistoryVideoId &&
      (historyReport.athlete_slot ?? fallbackSlot) === selectedHistoryAthleteSlot &&
      !(
        String(historyDetail?.report_status || "").toLowerCase() === "pending" ||
        String(historyDetail?.report_status || "").toLowerCase() === "running"
      )
    ) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    const syncSlotReport = async () => {
      const hasActiveReportJob =
        String(historyDetail?.report_status || "").toLowerCase() === "pending" ||
        String(historyDetail?.report_status || "").toLowerCase() === "running";
      const cachedReport = readCachedAnalysisReport<AnalysisReportRecord>(
        selectedHistoryVideoId,
        selectedHistoryAthleteSlot,
      );
      const cachedSlot = cachedReport ? (cachedReport.athlete_slot ?? fallbackSlot) : null;
      if (cachedReport && cachedSlot === selectedHistoryAthleteSlot && !hasActiveReportJob) {
        setHistoryReport(cachedReport);
        setHistoryReportLoading(false);
        setHistoryReportAction(null);
        setHistoryReportError(null);
        return;
      }

      setHistoryReport(cachedReport);
      setHistoryReportLoading(true);
      setHistoryReportAction(hasActiveReportJob ? "generate" : "load");
      setHistoryReportError(null);
      try {
        const report = await ensureAnalysisReport<AnalysisReportRecord>(selectedHistoryVideoId, {
          athleteSlot: selectedHistoryAthleteSlot,
          generateIfMissing: false,
        });
        const resumedReport =
          hasActiveReportJob || !report
            ? await resumeLatestAnalysisReportJob<AnalysisReportRecord>(selectedHistoryVideoId, {
                athleteSlot: selectedHistoryAthleteSlot,
                pollIntervalMs: 1500,
                timeoutMs: 240000,
                signal: abortController.signal,
              })
            : null;
        if (!cancelled) {
          setHistoryReport(resumedReport ?? report ?? cachedReport ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setHistoryReport(cachedReport ?? null);
          setHistoryReportError(err instanceof Error ? err.message : "Failed to load report");
        }
      } finally {
        if (!cancelled) {
          setHistoryReportLoading(false);
          setHistoryReportAction(null);
        }
      }
    };

    void syncSlotReport();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    historyDetail,
    historyAthleteSlots,
    historyPoseData,
    historyReport,
    selectedHistoryAthleteSlot,
    selectedHistoryVideoId,
  ]);

  useEffect(() => {
    if (
      !activeChatVideoId ||
      !selectedHistoryVideoId ||
      activeChatVideoId !== selectedHistoryVideoId ||
      !historyPoseData
    ) {
      return;
    }

    setNeedsFullContextForNextSend(true);
    setChatContextPack(null);
  }, [activeChatVideoId, historyPoseData, selectedHistoryAthleteSlot, selectedHistoryVideoId]);

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
        `- Video: ${video.title || (isZh ? "未命名" : "Untitled")} (${getWeaponLabel(video.weapon, isZh)})`,
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
    [isZh],
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
      cancelActiveChatStream({ resetTyping: true });
      cancelHistoryDetailRequest();
      let requestedSessionId: string | null = null;

      const switchId = sessionSwitchRef.current + 1;
      const transitionId = beginContextTransition();
      sessionSwitchRef.current = switchId;
      setActiveChatVideoId(videoId);
      setActiveChatSessionId(null);
      setSessionHydrated(false);
      setIsDraftChatSession(false);
      setPendingQueuedMessage(null);
      setExternalContextPayload(null);
      setExternalContextSummary("");
      setExternalContextStatus(null);
      setNeedsExternalContextForNextSend(false);

      try {
        const contextData = options?.preloaded ?? (await fetchVideoContextData(videoId));
        if (!contextData || switchId !== sessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;
        const reportText = options?.reportText ?? buildReportContextText(contextData.report);
        const localSession = !options?.forceNewSession ? readVideoSession(videoId) : null;
        const contextAthleteSlot = contextData.report?.athlete_slot ?? getDefaultAthleteSlot(contextData.pose);

        const artifacts = buildContextArtifacts(
          contextData.video,
          contextData.pose,
          contextAthleteSlot,
          reportText,
        );

        const backendSession = await resolveBackendChatSession({
          videoId,
          sessionType: SESSION_TYPE_VIDEO,
          forceNew: Boolean(options?.forceNewSession),
          title: contextData.video.title || "Video coaching",
          contextSummary: artifacts.contextSummary,
        });
        if (switchId !== sessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;

        const backendSessionId = backendSession?.id || localSession?.session_id || null;
        requestedSessionId = backendSessionId;
        pendingUrlSessionIdRef.current = requestedSessionId;
        syncAnalyzeSessionUrl(requestedSessionId);
        setActiveChatSessionId(backendSessionId);

        let restoredMessages: Message[] | null = null;
        if (backendSessionId) {
          const detail = await loadBackendChatSessionDetail(backendSessionId);
          if (switchId !== sessionSwitchRef.current || transitionId !== contextTransitionRef.current) return;
          if (detail?.messages?.length) {
            restoredMessages = detail.messages
              .filter((item) => item.role === "user" || item.role === "assistant")
              .map((item) => toUiMessage(item));
          }
        }

        let nextMessages: Message[] = restoredMessages || [];
        let nextNeedsFullContext = false;

        if (!nextMessages.length && localSession?.messages?.length) {
          nextMessages = localSession.messages;
          nextNeedsFullContext = Boolean(localSession.needs_full_context);
        }

        if (!nextMessages.length) {
          const handoffMessage = buildHandoffMessage(
            contextData.video,
            reportText,
            artifacts.contextStatus.overflow,
            artifacts.suggestedPrompts,
          );
          nextMessages = [{ role: "assistant", content: handoffMessage }];
          nextNeedsFullContext = true;
        }

        setMessages(nextMessages);
        setChatContextSummary(artifacts.contextSummary);
        setChatContextStatus(artifacts.contextStatus);
        setChatSuggestedPrompts(artifacts.suggestedPrompts);
        setNeedsFullContextForNextSend(nextNeedsFullContext);
        setChatContextPack(nextNeedsFullContext ? artifacts.contextPack : null);
        setIsDraftChatSession(false);
        setSessionHydrated(true);
        pendingUrlSessionIdRef.current = null;
        syncAnalyzeSessionUrl(backendSessionId);
        void fetchChatSessions({ silent: true });
        persistVideoSession(
          videoId,
          backendSessionId,
          nextMessages,
          artifacts.contextSummary,
          artifacts.contextStatus,
          artifacts.suggestedPrompts,
          nextNeedsFullContext,
        );

        if (options?.switchToChat) {
          setActiveTab("chat");
        }
      } finally {
        if (pendingUrlSessionIdRef.current === requestedSessionId) {
          pendingUrlSessionIdRef.current = null;
        }
        if (switchId === sessionSwitchRef.current && transitionId === contextTransitionRef.current) {
          setIsContextPreparing(false);
        }
      }
    },
    [
      beginContextTransition,
      buildContextArtifacts,
      buildHandoffMessage,
      cancelActiveChatStream,
      cancelHistoryDetailRequest,
      fetchChatSessions,
      fetchVideoContextData,
      loadBackendChatSessionDetail,
      persistVideoSession,
      readVideoSession,
      resolveBackendChatSession,
      syncAnalyzeSessionUrl,
    ],
  );

  useEffect(() => {
    if (!sessionHydrated || !activeChatVideoId) return;
    persistVideoSession(
      activeChatVideoId,
      activeChatSessionId,
      messages,
      chatContextSummary,
      chatContextStatus,
      chatSuggestedPrompts,
      needsFullContextForNextSend,
    );
  }, [
    activeChatVideoId,
    activeChatSessionId,
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
    void fetchChatSessions();
  }, [fetchChatSessions]);

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
      setActiveChatSessionId(null);
      setSelectedHistoryVideoId(null);
      setHistoryDetail(null);
      setHistoryPoseData(null);
      setHistoryReport(null);
      setHistoryDetailLoading(false);
      setHistoryReportLoading(false);
      setHistoryReportAction(null);
      setHistoryDetailError(null);
      setHistoryReportError(null);
      setChatContextPack(null);
      setChatContextSummary(handoff.summary || "");
      setChatContextStatus(null);
      setExternalContextPayload(handoff.context);
      setExternalContextSummary(handoff.summary || "");
      setExternalContextStatus(handoff.status || null);
      setNeedsExternalContextForNextSend(true);
      setChatSuggestedPrompts(
        handoff.suggested_prompts?.length ? handoff.suggested_prompts : defaultQuickPrompts,
      );
      setNeedsFullContextForNextSend(false);
      setIsDraftChatSession(false);
      setSessionHydrated(false);
      const autoQuestion =
        handoff.auto_question?.trim() ||
        handoff.suggested_prompts?.[0]?.trim() ||
        "Evaluate my recent fatigue and suggest next week's load progression.";
      void (async () => {
        const trainingSession = await resolveBackendChatSession({
          sessionType: SESSION_TYPE_TRAINING,
          forceNew: true,
          title: `Training Analysis ${new Date().toLocaleDateString()}`,
          contextSummary: handoff.summary || "",
        });
        if (trainingSession?.id) {
          setActiveChatSessionId(trainingSession.id);
          syncAnalyzeSessionUrl(trainingSession.id);
          void fetchChatSessions({ silent: true });
        }
        setPendingAutoQuestion(autoQuestion);
      })();
    } catch {
      // Ignore malformed payload and continue with normal flow.
    } finally {
      window.localStorage.removeItem(TRAINING_HANDOFF_STORAGE_KEY);
      setHasHandledTrainingHandoff(true);
    }
  }, [
    defaultQuickPrompts,
    fetchChatSessions,
    hasHandledTrainingHandoff,
    resolveBackendChatSession,
    searchParams,
    syncAnalyzeSessionUrl,
  ]);

  useEffect(() => {
    const videoId = searchParams.get("video");

    if (!videoId) {
      if (hasHandledSearchParamVideo) {
        setHasHandledSearchParamVideo(false);
      }
      return;
    }

    if (hasHandledSearchParamVideo) return;

    contextTransitionRef.current += 1;
    suppressUrlSessionRestoreRef.current = true;
    hasInitializedDefaultSessionRef.current = true;
    setSelectedHistoryVideoId(videoId);
    setActiveTab("history");
    void (async () => {
      await loadHistoryDetail(videoId);
    })();
    setHasHandledSearchParamVideo(true);
  }, [hasHandledSearchParamVideo, searchParams, loadHistoryDetail]);

  useEffect(() => {
    if (!hasHandledTrainingHandoff) return;
    if (isContextPreparing) return;

    const hasTrainingContext = searchParams.get("training_context") === "1";
    const videoId = searchParams.get("video");
    if (hasTrainingContext || videoId) {
      return;
    }

    if (selectedHistoryVideoId) {
      return;
    }

    if (suppressUrlSessionRestoreRef.current && !activeChatSessionId) {
      return;
    }

    const chatSessionId = searchParams.get("chat_session");
    if (chatSessionId) {
      if (suppressUrlSessionRestoreRef.current && !activeChatSessionId) {
        return;
      }
      suppressUrlSessionRestoreRef.current = false;
      hasInitializedDefaultSessionRef.current = true;
      if (
        chatSessionId !== activeChatSessionId &&
        chatSessionId !== pendingUrlSessionIdRef.current
      ) {
        void activateChatSessionById(chatSessionId, { switchToChat: true });
      }
      return;
    }

    suppressUrlSessionRestoreRef.current = false;

    if (activeChatSessionId || hasInitializedDefaultSessionRef.current) {
      return;
    }

    hasInitializedDefaultSessionRef.current = true;
    let cancelled = false;
    void (async () => {
      const sessions = await listBackendChatSessions({ limit: 20 });
      if (cancelled) return;
      const recentVideo = sessions.find(
        (session) => Boolean(session.video_id) || normalizeSessionType(session.session_type) === SESSION_TYPE_VIDEO,
      );
      if (recentVideo?.id) {
        if (cancelled) return;
        await activateChatSessionById(recentVideo.id, { switchToChat: true });
        return;
      }
      const recentNonVideo = sessions.find(
        (session) => !session.video_id && normalizeSessionType(session.session_type) !== SESSION_TYPE_VIDEO,
      );
      if (recentNonVideo?.id) {
        if (cancelled) return;
        await activateChatSessionById(recentNonVideo.id, { switchToChat: true });
        return;
      }
      if (cancelled) return;
      await activateGeneralChatSession({
        forceNew: false,
        switchToChat: true,
        sessionType: SESSION_TYPE_CHAT,
        title: "Assistant Chat",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeChatSessionId,
    activateChatSessionById,
    activateGeneralChatSession,
    hasHandledTrainingHandoff,
    isContextPreparing,
    listBackendChatSessions,
    searchParams,
    selectedHistoryVideoId,
  ]);

  const handleOpenVideoDetail = useCallback(
    (videoId: string) => {
      cancelActiveChatStream({ resetTyping: true });
      cancelHistoryDetailRequest();
      // Abort any in-flight session/detail transitions so stale async completions
      // cannot switch the UI back to chat right after opening history detail.
      chatSessionSwitchRef.current += 1;
      sessionSwitchRef.current += 1;
      historyDetailRequestRef.current += 1;
      contextTransitionRef.current += 1;
      pendingUrlSessionIdRef.current = null;
      suppressUrlSessionRestoreRef.current = true;
      hasInitializedDefaultSessionRef.current = true;
      setSelectedHistoryVideoId(videoId);
      setActiveTab("history");
      setIsMobileSidebarOpen(false);
      void (async () => {
        await loadHistoryDetail(videoId);
      })();
    },
    [cancelActiveChatStream, cancelHistoryDetailRequest, loadHistoryDetail],
  );

  const handleEnterVideoAnalysis = useCallback(() => {
    cancelActiveChatStream({ resetTyping: true });
    cancelHistoryDetailRequest();
    // Cancel in-flight context switches/detail loads so stale responses cannot override this intent.
    chatSessionSwitchRef.current += 1;
    sessionSwitchRef.current += 1;
    historyDetailRequestRef.current += 1;
    contextTransitionRef.current += 1;
    pendingUrlSessionIdRef.current = null;
    suppressUrlSessionRestoreRef.current = true;
    hasInitializedDefaultSessionRef.current = true;

    setActiveTab("analyze");
    setIsMobileSidebarOpen(false);
    setInput("");
    setMessages([{ role: "assistant", content: defaultChatOpening }]);
    setIsTyping(false);
    setIsContextPreparing(false);
    setSessionHydrated(true);
    setIsDraftChatSession(true);
    setPendingAutoQuestion(null);
    setPendingQueuedMessage(null);

    setActiveChatVideoId(null);
    setActiveChatSessionId(null);
    setChatContextPack(null);
    setChatContextSummary("");
    setChatContextStatus(null);
    setChatSuggestedPrompts(defaultQuickPrompts);
    setNeedsFullContextForNextSend(false);

    setExternalContextPayload(null);
    setExternalContextSummary("");
    setExternalContextStatus(null);
    setNeedsExternalContextForNextSend(false);

    setSelectedHistoryVideoId(null);
    setHistoryDetail(null);
    setHistoryPoseData(null);
    setHistoryReport(null);
    setHistoryDetailLoading(false);
    setHistoryReportLoading(false);
    setHistoryReportAction(null);
    setHistoryDetailError(null);
    setHistoryReportError(null);

    syncAnalyzeSessionUrl(null);
  }, [
    cancelActiveChatStream,
    cancelHistoryDetailRequest,
    defaultChatOpening,
    defaultQuickPrompts,
    syncAnalyzeSessionUrl,
  ]);

  const handleSelectChatSession = useCallback(
    (sessionId: string) => {
      if (!sessionId) return;
      setIsMobileSidebarOpen(false);
      setActiveTab("chat");
      setIsDraftChatSession(false);
      suppressUrlSessionRestoreRef.current = false;
      void activateChatSessionById(sessionId, { switchToChat: true });
    },
    [activateChatSessionById],
  );

  const handleGenerateHistoryReport = useCallback(async () => {
    if (!selectedHistoryVideoId) return;

    try {
      setHistoryReportLoading(true);
      setHistoryReportAction("generate");
      setHistoryReportError(null);

      const job = await startAnalysisReportJob(selectedHistoryVideoId, {
        athleteSlot: selectedHistoryAthleteSlot,
        forceRegenerate: Boolean(historyReport),
      });
      const jobStatus = await waitForAnalysisReportJob<AnalysisReportRecord>(
        selectedHistoryVideoId,
        job.job_id,
        { pollIntervalMs: 1500, timeoutMs: 240000 },
      );
      const data =
        jobStatus.results.find(
          (item) => (item.athlete_slot ?? selectedHistoryAthleteSlot) === selectedHistoryAthleteSlot,
        ) ?? jobStatus.results[0];
      if (!data) {
        throw new Error("Failed to generate report");
      }
      setHistoryReport(data);
      if (selectedHistoryVideoId && selectedHistoryVideoId === activeChatVideoId) {
        setNeedsFullContextForNextSend(true);
        setChatContextPack(null);
      }
    } catch (err) {
      setHistoryReportError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setHistoryReportLoading(false);
      setHistoryReportAction(null);
    }
  }, [activeChatVideoId, historyReport, selectedHistoryAthleteSlot, selectedHistoryVideoId]);

  const handleAskAiAboutHistory = useCallback(() => {
    if (!historyDetail) return;

    const title = historyDetail.title || "this match";
    const opponent = historyDetail.opponent ? ` vs ${historyDetail.opponent}` : "";
    const prompt = `Please review ${title}${opponent} and give me 3 concrete improvements for my next training session.`;

    setInput(prompt);
    setPendingQueuedMessage(null);

    void (async () => {
      if (
        selectedHistoryVideoId &&
        (selectedHistoryVideoId !== activeChatVideoId || !sessionHydrated || isContextPreparing)
      ) {
        await activateVideoChatSession(selectedHistoryVideoId, {
          switchToChat: true,
          preloaded: {
            video: historyDetail,
            pose: historyPoseData,
            report: historyReport,
          },
        });
        return;
      }

      setActiveTab("chat");
    })();
  }, [
    activeChatVideoId,
    activateVideoChatSession,
    historyDetail,
    historyPoseData,
    historyReport,
    isContextPreparing,
    selectedHistoryVideoId,
    sessionHydrated,
  ]);

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

    const contextData = await fetchVideoContextData(
      activeChatVideoId,
      activeChatVideoId === selectedHistoryVideoId ? selectedHistoryAthleteSlot : undefined,
    );
    const reportText = buildReportContextText(contextData.report);
    const contextAthleteSlot = contextData.report?.athlete_slot ?? getDefaultAthleteSlot(contextData.pose);
    const artifacts = buildContextArtifacts(
      contextData.video,
      contextData.pose,
      contextAthleteSlot,
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
    selectedHistoryAthleteSlot,
    selectedHistoryVideoId,
  ]);

  const handleUpload = async () => {
    if (!videoFile) return;

    stopProcessingProgress();
    setVideoFile((prev) => (prev ? { ...prev, status: "uploading", progress: 8 } : null));

    try {
      const initiateResponse = await authFetch("/video/uploads/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: videoFile.file.name,
          content_type: videoFile.file.type || "video/mp4",
          file_size: videoFile.file.size,
          title: metadata.title || videoFile.name,
          athlete: metadata.athlete,
          opponent: metadata.opponent,
          weapon: selectedWeapon,
          match_result: metadata.matchResult,
          score: metadata.score,
          tournament: metadata.tournament,
        }),
      });

      let uploadData: { video_id: string };
      if (initiateResponse.ok) {
        const initiateData = (await initiateResponse.json()) as {
          video_id: string;
          upload_url: string;
          method?: string;
          headers?: Record<string, string>;
        };
        setVideoFile((prev) => (prev ? { ...prev, progress: 20, id: initiateData.video_id } : null));

        const putHeaders = new Headers(initiateData.headers || {});
        if (!putHeaders.has("Content-Type") && videoFile.file.type) {
          putHeaders.set("Content-Type", videoFile.file.type);
        }
        const objectUploadResponse = await fetch(initiateData.upload_url, {
          method: initiateData.method || "PUT",
          headers: putHeaders,
          body: videoFile.file,
        });
        if (!objectUploadResponse.ok) {
          throw new Error("Object upload failed");
        }
        setVideoFile((prev) => (prev ? { ...prev, progress: 46, id: initiateData.video_id } : null));

        const completeResponse = await authFetch("/video/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: initiateData.video_id,
            file_size: videoFile.file.size,
            content_type: videoFile.file.type || "video/mp4",
          }),
        });
        if (!completeResponse.ok) {
          throw new Error("Upload completion verification failed");
        }
        uploadData = { video_id: initiateData.video_id };
      } else {
        // Backward-compatible fallback for local or legacy deployments.
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
        uploadData = (await uploadResponse.json()) as { video_id: string };
      }

      setVideoFile((prev) => (prev ? { ...prev, progress: 55, id: uploadData.video_id } : null));
      setVideoFile((prev) => (prev ? { ...prev, status: "processing", progress: 62 } : null));
      startProcessingProgress();

      let reportMessage = "";

      if (analysisMode === "pose") {
        const poseJob = await startPoseAnalysisJob(uploadData.video_id);
        reportMessage =
          "Video uploaded successfully. Pose analysis started in background, and the report will generate automatically after pose extraction finishes.";

        void (async () => {
          try {
            const poseJobStatus = await waitForPoseAnalysisJob(uploadData.video_id, poseJob.job_id, {
              pollIntervalMs: 1500,
              timeoutMs: 900000,
            });

            const analyzeData = poseJobStatus.result as PoseAnalysisResult | null | undefined;
            if (analyzeData) {
              setPoseResult(analyzeData);
            }
            setVideoFile((prev) =>
              prev && prev.id === uploadData.video_id
                ? { ...prev, progress: Math.max(prev.progress, 88) }
                : prev,
            );

            if (selectedHistoryVideoIdRef.current === uploadData.video_id) {
              void loadHistoryDetail(uploadData.video_id);
            }

            try {
              setVideoFile((prev) =>
                prev && prev.id === uploadData.video_id
                  ? { ...prev, progress: Math.max(prev.progress, 92) }
                  : prev,
              );
              const linkedSessionId =
                (activeChatVideoIdRef.current === uploadData.video_id
                  ? activeChatSessionIdRef.current
                  : null) || readVideoSession(uploadData.video_id)?.session_id || null;
              const reportJob = await startAnalysisReportJob(uploadData.video_id, {
                forceRegenerate: false,
                chatSessionId: linkedSessionId,
              });
              const jobStatus = await waitForAnalysisReportJob<AnalysisReportRecord>(
                uploadData.video_id,
                reportJob.job_id,
                { pollIntervalMs: 1500, timeoutMs: 300000 },
              );

              if (selectedHistoryVideoIdRef.current === uploadData.video_id) {
                const preferredSlotReport =
                  jobStatus.results.find((item) => item.athlete_slot === selectedHistoryAthleteSlot) ??
                  jobStatus.results[0];
                if (preferredSlotReport) {
                  setHistoryReport(preferredSlotReport);
                }
              }

              const activeSessionId =
                activeChatVideoIdRef.current === uploadData.video_id
                  ? activeChatSessionIdRef.current
                  : null;
              if (activeSessionId) {
                const detail = await loadBackendChatSessionDetail(activeSessionId);
                if (
                  detail &&
                  activeChatVideoIdRef.current === uploadData.video_id &&
                  activeChatSessionIdRef.current === activeSessionId
                ) {
                  const restoredMessages: Message[] = detail.messages?.length
                    ? detail.messages
                        .filter((item) => item.role === "user" || item.role === "assistant")
                        .map((item) => toUiMessage(item))
                    : [{ role: "assistant", content: defaultChatOpening }];
                  setMessages(restoredMessages);
                }
              }
            } catch (reportError) {
              console.error("Pose report background job failed:", reportError);
            }

            stopProcessingProgress();
            setVideoFile((prev) =>
              prev && prev.id === uploadData.video_id
                ? { ...prev, status: "complete", progress: 100 }
                : prev,
            );
            void fetchHistoryVideos();
          } catch (poseError) {
            console.error("Pose analysis background job failed:", poseError);
            stopProcessingProgress();
            setVideoFile((prev) =>
              prev && prev.id === uploadData.video_id
                ? { ...prev, status: "error", progress: 0 }
                : prev,
            );
            if (selectedHistoryVideoIdRef.current === uploadData.video_id) {
              setUploadError("Pose analysis failed in background. Please try again.");
            }
          }
        })();
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

      if (analysisMode !== "pose") {
        stopProcessingProgress();
        setVideoFile((prev) => (prev ? { ...prev, status: "complete", progress: 100 } : null));
      }
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

  const handleRemoveVideo = async () => {
    const message =
      videoFile?.status === "uploading" || videoFile?.status === "processing"
        ? "Analysis is in progress. Remove this video and stop the current task?"
        : "Remove this selected video?";
    const confirmed = await confirm({
      title: "Remove video?",
      description: message,
      confirmText: "Remove",
      cancelText: "Keep",
      danger: true,
    });
    if (!confirmed) return;

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

      const streamId = activeStreamIdRef.current + 1;
      activeStreamIdRef.current = streamId;
      if (activeStreamAbortRef.current) {
        activeStreamAbortRef.current.abort();
      }
      const streamAbortController = new AbortController();
      activeStreamAbortRef.current = streamAbortController;

      const isActiveStream = () =>
        streamId === activeStreamIdRef.current && !streamAbortController.signal.aborted;
      const isAbortError = (error: unknown) =>
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");

      try {
        const recentMessages = nextMessages.slice(-MAX_BACKEND_SESSION_MESSAGES);
        let contextPayload: string | undefined;
        let sessionIdForSend = activeChatSessionId;

        if (activeChatVideoId) {
          if (needsFullContextForNextSend) {
            const fullContext = await ensureActiveVideoContext();
            if (!isActiveStream()) return;
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

        if (!activeChatVideoId && !sessionIdForSend) {
          const shouldForceNewSession = needsExternalContextForNextSend || isDraftChatSession;
          const createdSession = await resolveBackendChatSession({
            sessionType: needsExternalContextForNextSend ? SESSION_TYPE_TRAINING : SESSION_TYPE_CHAT,
            forceNew: shouldForceNewSession,
            title:
              needsExternalContextForNextSend
                ? "Training Analysis"
                : `Chat ${new Date().toLocaleDateString()}`,
            contextSummary: contextPayload || "",
          });
          if (!isActiveStream()) return;
          if (createdSession?.id) {
            sessionIdForSend = createdSession.id;
            setActiveChatSessionId(createdSession.id);
            setIsDraftChatSession(false);
            syncAnalyzeSessionUrl(createdSession.id);
            void fetchChatSessions({ silent: true });
          }
        }

        const kbWeapon = activeChatVideoId
          ? historyVideos.find((item) => item.video_id === activeChatVideoId)?.weapon?.toLowerCase()
          : undefined;

        const payload = sessionIdForSend
          ? {
              session_id: sessionIdForSend,
              message: userMessage,
              context: contextPayload,
              use_kb: true,
              weapon: kbWeapon,
            }
          : {
              messages: recentMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              context: contextPayload,
              use_kb: true,
              weapon: kbWeapon,
            };

        const requestInit: RequestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: streamAbortController.signal,
        };

        const sendNonStreamFallback = async () => {
          const response = await authFetch("/chat", requestInit);
          if (!isActiveStream()) return;
          if (!response.ok) {
            throw new Error("Failed to send message");
          }
          const data = (await response.json()) as {
            message: string;
            session_id?: string;
            citations?: CitationRecord[] | null;
            retrieval_meta?: RetrievalMetaRecord | null;
          };
          if (!isActiveStream()) return;
          const updatedMessages = [
            ...nextMessages,
            {
              role: "assistant" as const,
              content: data.message,
              citations: Array.isArray(data.citations) ? data.citations : undefined,
              retrievalMeta: data.retrieval_meta ?? null,
            },
          ];
          setMessages(updatedMessages);
          if (typeof data.session_id === "string" && data.session_id) {
            setActiveChatSessionId(data.session_id);
            setIsDraftChatSession(false);
            syncAnalyzeSessionUrl(data.session_id);
          }
        };

        const streamResponse = await authFetch("/chat/stream", requestInit);
        if (!isActiveStream()) return;
        const streamContentType = streamResponse.headers.get("content-type") || "";
        const shouldUseStream = streamResponse.ok && Boolean(streamResponse.body) && streamContentType.includes("text/event-stream");
        if (!shouldUseStream) {
          await sendNonStreamFallback();
          if (!isActiveStream()) return;
          setIsTyping(false);
          setNeedsFullContextForNextSend(false);
          setNeedsExternalContextForNextSend(false);
          void fetchChatSessions({ silent: true });
          return;
        }

        const assistantBase = [...nextMessages, { role: "assistant" as const, content: "" }];
        if (!isActiveStream()) return;
        setMessages(assistantBase);

        let streamedAssistant = "";
        let finalMessageFromDone: string | null = null;
        let resolvedSessionId: string | null = sessionIdForSend ?? null;
        let streamErrorMessage: string | null = null;
        let doneCitations: CitationRecord[] | undefined;
        let doneRetrievalMeta: RetrievalMetaRecord | null = null;

        const applyAssistantText = (
          text: string,
          options?: {
            citations?: CitationRecord[];
            retrievalMeta?: RetrievalMetaRecord | null;
          },
        ) => {
          if (!isActiveStream()) return;
          setMessages([
            ...nextMessages,
            {
              role: "assistant" as const,
              content: text,
              citations: options?.citations,
              retrievalMeta: options?.retrievalMeta ?? null,
            },
          ]);
        };

        const processEventBlock = (block: string) => {
          const lines = block.split("\n");
          let eventType = "message";
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
              continue;
            }
            if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            }
          }

          if (!dataLines.length) return;
          const rawData = dataLines.join("\n");
          let payloadData: Record<string, unknown> | null = null;
          try {
            payloadData = JSON.parse(rawData) as Record<string, unknown>;
          } catch {
            payloadData = { message: rawData };
          }

          if (eventType === "meta") {
            const maybeSessionId = payloadData?.session_id;
            if (typeof maybeSessionId === "string" && maybeSessionId) {
              resolvedSessionId = maybeSessionId;
            }
            return;
          }

          if (eventType === "chunk") {
            const delta = payloadData?.delta;
            if (typeof delta === "string" && delta) {
              streamedAssistant += delta;
              applyAssistantText(streamedAssistant);
            }
            return;
          }

          if (eventType === "done") {
            const maybeMessage = payloadData?.message;
            if (typeof maybeMessage === "string" && maybeMessage) {
              finalMessageFromDone = maybeMessage;
            }
            const maybeCitations = payloadData?.citations;
            if (Array.isArray(maybeCitations)) {
              doneCitations = maybeCitations as CitationRecord[];
            }
            const maybeRetrievalMeta = payloadData?.retrieval_meta;
            if (maybeRetrievalMeta && typeof maybeRetrievalMeta === "object") {
              doneRetrievalMeta = maybeRetrievalMeta as RetrievalMetaRecord;
            }
            const maybeSessionId = payloadData?.session_id;
            if (typeof maybeSessionId === "string" && maybeSessionId) {
              resolvedSessionId = maybeSessionId;
            }
            return;
          }

          if (eventType === "error") {
            const maybeError = payloadData?.message;
            streamErrorMessage = typeof maybeError === "string" && maybeError ? maybeError : "Failed to stream response";
          }
        };

        const reader = streamResponse.body!.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (isActiveStream()) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let splitIndex = buffer.indexOf("\n\n");
          while (splitIndex !== -1) {
            const eventBlock = buffer.slice(0, splitIndex).trim();
            buffer = buffer.slice(splitIndex + 2);
            if (eventBlock) {
              processEventBlock(eventBlock);
            }
            splitIndex = buffer.indexOf("\n\n");
          }
        }
        if (!isActiveStream()) return;
        buffer += decoder.decode();
        const trailingBlock = buffer.trim();
        if (trailingBlock) {
          processEventBlock(trailingBlock);
        }

        if (streamErrorMessage) {
          throw new Error(streamErrorMessage);
        }

        if (finalMessageFromDone) {
          streamedAssistant = finalMessageFromDone;
          applyAssistantText(streamedAssistant, {
            citations: doneCitations,
            retrievalMeta: doneRetrievalMeta,
          });
        } else if (doneCitations || doneRetrievalMeta) {
          applyAssistantText(streamedAssistant, {
            citations: doneCitations,
            retrievalMeta: doneRetrievalMeta,
          });
        }

        if (!streamedAssistant.trim()) {
          throw new Error("Failed to receive streamed response");
        }

        if (!isActiveStream()) return;
        setIsTyping(false);
        if (typeof resolvedSessionId === "string" && resolvedSessionId) {
          setActiveChatSessionId(resolvedSessionId);
          setIsDraftChatSession(false);
          syncAnalyzeSessionUrl(resolvedSessionId);
        }
        setNeedsFullContextForNextSend(false);
        setNeedsExternalContextForNextSend(false);
        void fetchChatSessions({ silent: true });
      } catch (error) {
        if (isAbortError(error) || !isActiveStream()) {
          return;
        }
        setIsTyping(false);
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          },
        ]);
      } finally {
        if (
          activeStreamIdRef.current === streamId &&
          activeStreamAbortRef.current === streamAbortController
        ) {
          activeStreamAbortRef.current = null;
        }
      }
    },
    [
      activeChatSessionId,
      activeChatVideoId,
      chatContextSummary,
      ensureActiveVideoContext,
      externalContextPayload,
      externalContextSummary,
      historyVideos,
      isContextPreparing,
      isDraftChatSession,
      isTyping,
      messages,
      needsExternalContextForNextSend,
      needsFullContextForNextSend,
      fetchChatSessions,
      resolveBackendChatSession,
      syncAnalyzeSessionUrl,
    ],
  );

  const handleSend = useCallback(() => {
    const nextMessage = input.trim();
    if (!nextMessage || isTyping) return;

    if (isContextPreparing) {
      setPendingQueuedMessage(nextMessage);
      setInput("");
      return;
    }

    void sendMessage(nextMessage);
  }, [input, isContextPreparing, isTyping, sendMessage]);

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter") return;

      const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
      const isComposing = Boolean(nativeEvent.isComposing) || nativeEvent.keyCode === 229;
      if (isComposing) {
        return;
      }

      if (event.shiftKey) return;

      event.preventDefault();
      handleSend();
    },
    [handleSend],
  );

  const handleNewChatSession = useCallback(() => {
    cancelActiveChatStream({ resetTyping: true });
    cancelHistoryDetailRequest();
    chatSessionSwitchRef.current += 1;
    sessionSwitchRef.current += 1;
    historyDetailRequestRef.current += 1;
    contextTransitionRef.current += 1;
    pendingUrlSessionIdRef.current = null;
    suppressUrlSessionRestoreRef.current = true;
    hasInitializedDefaultSessionRef.current = true;

    setActiveTab("chat");
    setInput("");
    setMessages([{ role: "assistant", content: defaultChatOpening }]);
    setIsTyping(false);
    setIsContextPreparing(false);
    setSessionHydrated(true);
    setIsDraftChatSession(true);
    setPendingQueuedMessage(null);

    setActiveChatVideoId(null);
    setActiveChatSessionId(null);
    setSelectedHistoryVideoId(null);
    setHistoryDetail(null);
    setHistoryPoseData(null);
    setHistoryReport(null);
    setHistoryDetailLoading(false);
    setHistoryReportLoading(false);
    setHistoryReportAction(null);
    setHistoryDetailError(null);
    setHistoryReportError(null);
    setChatContextPack(null);
    setChatContextSummary("");
    setChatContextStatus(null);
    setChatSuggestedPrompts(defaultQuickPrompts);
    setNeedsFullContextForNextSend(false);

    setExternalContextPayload(null);
    setExternalContextSummary("");
    setExternalContextStatus(null);
    setNeedsExternalContextForNextSend(false);
    setPendingAutoQuestion(null);

    syncAnalyzeSessionUrl(null);
  }, [
    cancelActiveChatStream,
    cancelHistoryDetailRequest,
    defaultChatOpening,
    defaultQuickPrompts,
    syncAnalyzeSessionUrl,
  ]);

  const handleDeleteChatSession = useCallback(
    async (session: ChatSessionRecord) => {
      if (!session.id || deletingSessionId === session.id) return;

      const normalizedType = normalizeSessionType(session.session_type);
      const isVideoSession = normalizedType === SESSION_TYPE_VIDEO && Boolean(session.video_id);

      const confirmed = await confirm({
        title: isVideoSession ? "Delete this video session?" : "Delete this session?",
        description: isVideoSession
          ? "This will permanently delete all related video-analysis sessions, messages, video assets, and reports for this video. This action cannot be undone."
          : "This will permanently delete the session and all its messages. This action cannot be undone.",
        confirmText: "Delete",
        cancelText: "Cancel",
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
          throw new Error(await parseApiError(response, "Failed to delete session"));
        }

        const deleted = (await response.json()) as ChatSessionDeleteResponse;
        const deletedVideoId = deleted.video_id || null;
        if (deletedVideoId && typeof window !== "undefined") {
          window.localStorage.removeItem(buildSessionStorageKey(deletedVideoId));
          clearCachedAnalysisReports(deletedVideoId);
        }

        const clearedCurrentVideo =
          deleted.deleted_scope === "video_full" &&
          Boolean(deletedVideoId) &&
          activeChatVideoId === deletedVideoId;
        const clearedCurrentSession = activeChatSessionId === session.id;

        if (deletedVideoId && selectedHistoryVideoId === deletedVideoId) {
          setSelectedHistoryVideoId(null);
          setHistoryDetail(null);
          setHistoryPoseData(null);
          setHistoryReport(null);
          setHistoryDetailError(null);
          setHistoryReportError(null);
        }

        if (clearedCurrentSession || clearedCurrentVideo) {
          handleNewChatSession();
        }

        await fetchChatSessions({ silent: true });
        if (deleted.deleted_scope === "video_full") {
          await fetchHistoryVideos();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete session";
        setChatSessionsError(message);
        await alert({
          title: "Delete failed",
          description: message,
          confirmText: "OK",
        });
      } finally {
        setDeletingSessionId(null);
      }
    },
    [
      activeChatSessionId,
      activeChatVideoId,
      deletingSessionId,
      fetchChatSessions,
      fetchHistoryVideos,
      handleNewChatSession,
      confirm,
      alert,
      selectedHistoryVideoId,
    ],
  );

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

  useEffect(() => {
    if (!pendingQueuedMessage) return;
    if (isTyping || isContextPreparing) return;

    const queuedMessage = pendingQueuedMessage;
    setPendingQueuedMessage(null);
    void sendMessage(queuedMessage);
  }, [isContextPreparing, isTyping, pendingQueuedMessage, sendMessage]);

  const getWeaponStyle = (weapon: string) => {
    return WEAPON_TYPES.find((w) => w.value === weapon) || WEAPON_TYPES[1];
  };

  const selectedWeaponStyle = getWeaponStyle(selectedWeapon);
  const selectedWeaponNotes = isZh ? WEAPON_TYPE_NOTES_ZH : WEAPON_TYPE_NOTES_EN;
  const selectedWeaponNote = selectedWeaponNotes[selectedWeapon] ?? selectedWeaponNotes.epee;
  const getSessionTypeLabel = useCallback(
    (sessionType: SessionType) => {
      if (sessionType === SESSION_TYPE_VIDEO) return t("视频分析", "Video Analysis");
      if (sessionType === SESSION_TYPE_TRAINING) return t("训练分析", "Training Analysis");
      return t("AI 对话", "Assistant Chat");
    },
    [t],
  );

  const historyVideoById = useMemo(() => {
    const map = new Map<string, HistoryItem>();
    for (const video of historyVideos) {
      map.set(video.video_id, video);
    }
    return map;
  }, [historyVideos]);

  const getSessionTitle = useCallback(
    (session: ChatSessionRecord) => {
      const normalizedType = normalizeSessionType(session.session_type);
      const customTitle = session.title?.trim();
      if (customTitle) return customTitle;

      if (normalizedType === SESSION_TYPE_VIDEO) {
        if (session.video_id) {
          return historyVideoById.get(session.video_id)?.title || getSessionTypeLabel(SESSION_TYPE_VIDEO);
        }
        return getSessionTypeLabel(SESSION_TYPE_VIDEO);
      }
      if (normalizedType === SESSION_TYPE_TRAINING) {
        return getSessionTypeLabel(SESSION_TYPE_TRAINING);
      }
      return getSessionTypeLabel(SESSION_TYPE_CHAT);
    },
    [getSessionTypeLabel, historyVideoById],
  );

  const getSessionSubtitle = useCallback(
    (session: ChatSessionRecord) => {
      const normalizedType = normalizeSessionType(session.session_type);
      const video = session.video_id ? historyVideoById.get(session.video_id) : null;

      if (normalizedType === SESSION_TYPE_VIDEO && video) {
        return [video.athlete, video.opponent ? `vs ${video.opponent}` : "", video.tournament]
          .filter(Boolean)
          .join(" ")
          || t("视频教练会话", "Video coaching thread");
      }

      if (session.context_summary?.trim()) {
        return session.context_summary.trim();
      }

      if (normalizedType === SESSION_TYPE_TRAINING) {
        return t("训练记录分析会话", "Training record analysis thread");
      }
      if (normalizedType === SESSION_TYPE_VIDEO) {
        return t("视频教练会话", "Video coaching thread");
      }
      return t("通用 AI 问答会话", "General AI Q&A thread");
    },
    [historyVideoById, t],
  );

  const filteredChatSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();

    const base = chatSessions.filter((session) => {
      if (!query) return true;
      const normalizedType = normalizeSessionType(session.session_type);
      const video = session.video_id ? historyVideoById.get(session.video_id) : null;
      const text = [
        getSessionTitle(session),
        getSessionSubtitle(session),
        getSessionTypeLabel(normalizedType),
        video?.title,
        video?.athlete,
        video?.opponent,
        video?.tournament,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    });

    return base.sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a));
  }, [chatSessions, getSessionSubtitle, getSessionTitle, getSessionTypeLabel, historyVideoById, sessionSearch]);

  const activeChatSession = useMemo(
    () => chatSessions.find((session) => session.id === activeChatSessionId) ?? null,
    [activeChatSessionId, chatSessions],
  );

  const activeChatSessionType = useMemo<SessionType>(() => {
    if (activeChatSession) {
      return normalizeSessionType(activeChatSession.session_type);
    }
    if (activeChatVideoId) {
      return SESSION_TYPE_VIDEO;
    }
    if (externalContextStatus) {
      return SESSION_TYPE_TRAINING;
    }
    return SESSION_TYPE_CHAT;
  }, [activeChatSession, activeChatVideoId, externalContextStatus]);

  const activeChatSessionMeta = SESSION_META[activeChatSessionType];
  const activeChatSessionLabel = getSessionTypeLabel(activeChatSessionType);

  const activeChatSessionTitle = activeChatSession
    ? getSessionTitle(activeChatSession)
    : activeChatVideoId
      ? historyVideoById.get(activeChatVideoId)?.title || activeChatSessionLabel
      : activeChatSessionType === SESSION_TYPE_TRAINING
        ? t("训练分析", "Training Analysis")
        : t("AI 对话", "Assistant Chat");

  const activeChatSessionSubtitle = activeChatSession
    ? getSessionSubtitle(activeChatSession)
    : activeChatVideoId
      ? t("视频教练会话", "Video coaching thread")
      : activeChatSessionType === SESSION_TYPE_TRAINING
        ? t("训练记录分析会话", "Training record analysis thread")
        : t("通用 AI 问答会话", "General AI Q&A thread");

  const groupedChatSessions = useMemo<HistoryGroup[]>(() => {
    const today: ChatSessionRecord[] = [];
    const week: ChatSessionRecord[] = [];
    const earlier: ChatSessionRecord[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const session of filteredChatSessions) {
      const sessionTime = getSessionTimestamp(session);
      if (!sessionTime) {
        earlier.push(session);
        continue;
      }

      const sessionDate = new Date(sessionTime);
      if (sessionDate >= todayStart) {
        today.push(session);
        continue;
      }

      const diffMs = now.getTime() - sessionTime;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays <= 7) {
        week.push(session);
      } else {
        earlier.push(session);
      }
    }

    const groups: HistoryGroup[] = [
      { key: "today", label: t("今天", "Today"), items: today },
      { key: "week", label: t("最近 7 天", "Last 7 Days"), items: week },
      { key: "earlier", label: t("更早", "Earlier"), items: earlier },
    ];

    return groups.filter((group) => group.items.length > 0);
  }, [filteredChatSessions, t]);

  const renderSessionRows = (compact: boolean) => {
    if (chatSessionsLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: compact ? 6 : 5 }).map((_, idx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className={`${compact ? "h-10" : "h-20"} animate-pulse rounded-xl bg-muted`}
            />
          ))}
        </div>
      );
    }

    if (chatSessionsError) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-red-600">
          <p>{chatSessionsError}</p>
          <button
            type="button"
            onClick={() => void fetchChatSessions()}
            className="mt-2 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold hover:bg-red-100"
          >
            {t("重试", "Retry")}
          </button>
        </div>
      );
    }

    if (filteredChatSessions.length === 0) {
      if (chatSessions.length === 0) {
        return (
          <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {t("暂无会话，请先创建新对话。", "No sessions yet. Start a new chat.")}
          </div>
        );
      }
      return (
        <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {t("没有匹配当前筛选条件的会话。", "No sessions match your filters.")}
        </div>
      );
    }

    if (compact) {
      return (
        <div className="hide-scrollbar h-full overflow-x-hidden overflow-y-auto pr-1 pl-0.5">
          <div className="space-y-2.5 pb-1">
            {filteredChatSessions.map((session) => {
              const normalizedType = normalizeSessionType(session.session_type);
              const selected = activeChatSessionId === session.id;
              const dotColor = getSessionDotColor(normalizedType);

              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => handleSelectChatSession(session.id)}
                  className={`group mx-auto flex h-10 w-11 shrink-0 items-center justify-center rounded-xl border px-2 transition-all ${
                    selected
                      ? "border-foreground/25 bg-muted/70 shadow-sm"
                      : "border-border bg-card hover:border-red-300 hover:bg-card/80"
                  }`}
                  title={`${getSessionTypeLabel(normalizedType)} • ${getSessionTitle(session)}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                    style={{ backgroundColor: dotColor }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full space-y-5 overflow-y-auto pr-1">
        {groupedChatSessions.map((group) => (
          <div key={group.key}>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.items.map((session) => {
                const normalizedType = normalizeSessionType(session.session_type);
                const selected = activeChatSessionId === session.id;
                const meta = SESSION_META[normalizedType];
                const activityTime = session.last_message_at || session.updated_at || session.created_at;

                return (
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectChatSession(session.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSelectChatSession(session.id);
                      }
                    }}
                    className={`w-full cursor-pointer rounded-2xl border p-3 text-left transition-all ${
                      selected
                        ? "border-red-300 bg-red-50/80 shadow-sm"
                        : "border-border bg-card hover:border-red-200 hover:bg-card/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{getSessionTitle(session)}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{getSessionSubtitle(session)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                        {getSessionTypeLabel(normalizedType)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatRelativeTime(activityTime, isZh)}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                        {isZh ? `${session.message_count} 条` : `${session.message_count} msgs`}
                      </span>
                      {normalizedType === SESSION_TYPE_VIDEO && session.video_id ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleOpenVideoDetail(session.video_id!);
                          }}
                          className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground transition-colors hover:border-red-300 hover:text-red-600"
                        >
                          {t("打开视频详情", "Open Video Detail")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteChatSession(session);
                        }}
                        disabled={deletingSessionId === session.id}
                        className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
                      >
                        {deletingSessionId === session.id ? t("删除中...", "Deleting...") : t("删除", "Delete")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncReportUpdate = (videoId: string, nextReport?: AnalysisReportRecord | null) => {
      if (!videoId || videoId !== selectedHistoryVideoId) {
        return;
      }

      const resolvedReport = nextReport ?? readCachedAnalysisReport<AnalysisReportRecord>(
        videoId,
        selectedHistoryAthleteSlot,
      );
      if (!resolvedReport) {
        return;
      }

      if ((resolvedReport.athlete_slot ?? getDefaultAthleteSlot(historyPoseData)) !== selectedHistoryAthleteSlot) {
        return;
      }

      setHistoryReport(resolvedReport);

      if (
        videoId === activeChatVideoId &&
        historyDetail &&
        historyPoseData
      ) {
        const refreshedArtifacts = buildContextArtifacts(
          historyDetail,
          historyPoseData,
          selectedHistoryAthleteSlot,
          buildReportContextText(resolvedReport),
        );
        setChatContextSummary(refreshedArtifacts.contextSummary);
        setChatContextStatus(refreshedArtifacts.contextStatus);
        setChatSuggestedPrompts(refreshedArtifacts.suggestedPrompts);
        setNeedsFullContextForNextSend(true);
        setChatContextPack(null);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key) {
        return;
      }

      const cacheMeta = parseAnalysisReportCacheKey(event.key);
      if (!cacheMeta) {
        return;
      }
      let nextReport: AnalysisReportRecord | null = null;
      if (event.newValue) {
        try {
          nextReport = JSON.parse(event.newValue) as AnalysisReportRecord;
        } catch {
          nextReport = null;
        }
      }
      if ((cacheMeta.athleteSlot ?? getDefaultAthleteSlot(historyPoseData)) !== selectedHistoryAthleteSlot) {
        return;
      }
      syncReportUpdate(cacheMeta.videoId, nextReport);
    };

    const handleReportUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          videoId?: string;
          athleteSlot?: AthleteSlot | null;
          report?: AnalysisReportRecord | null;
        }>
      ).detail;
      if (!detail?.videoId) {
        return;
      }
      if ((detail.athleteSlot ?? getDefaultAthleteSlot(historyPoseData)) !== selectedHistoryAthleteSlot) {
        return;
      }
      syncReportUpdate(detail.videoId, detail.report ?? null);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(ANALYSIS_REPORT_UPDATED_EVENT, handleReportUpdated as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(ANALYSIS_REPORT_UPDATED_EVENT, handleReportUpdated as EventListener);
    };
  }, [
    activeChatVideoId,
    buildContextArtifacts,
    historyDetail,
    historyPoseData,
    selectedHistoryAthleteSlot,
    selectedHistoryVideoId,
  ]);

  return (
    <div className="min-h-screen bg-background">
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
              {t("会话", "Sessions")}
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
                        aria-label={t("展开历史侧栏", "Expand history sidebar")}
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    <div className="mb-3 flex items-center justify-center rounded-xl bg-secondary/60 p-2 text-center">
                      <div className="space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{isZh ? "记录" : "Rec"}</p>
                        <p className="text-sm font-semibold leading-none text-foreground">{chatSessions.length}</p>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">{renderSessionRows(true)}</div>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{t("会话", "Sessions")}</p>
                        <p className="text-xs text-muted-foreground">
                          {isZh ? `${chatSessions.length} 个线程` : `${chatSessions.length} threads`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleNewChatSession}
                          className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold transition-colors hover:border-red-300 hover:text-red-600"
                        >
                          {t("新建会话", "New Session")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsSidebarCollapsed(true)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                          aria-label={t("折叠会话侧栏", "Collapse session sidebar")}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mb-3">
                      <input
                        type="text"
                        value={sessionSearch}
                        onChange={(e) => setSessionSearch(e.target.value)}
                        placeholder={t("搜索会话或摘要...", "Search session, summary...")}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">{renderSessionRows(false)}</div>
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
                  {t("AI 教练", "AI Coach")}
                </button>
                <button
                  type="button"
                  onClick={handleEnterVideoAnalysis}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    activeTab === "analyze"
                      ? "bg-background text-red-600 shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("视频分析", "Video Analysis")}
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
                  {t("历史详情", "History Detail")}
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
                        <h3 className="mb-3 text-2xl font-bold">{t("将视频拖到这里", "Drop your video here")}</h3>
                        <p className="mb-2 text-muted-foreground">{t("或点击选择文件", "or click to browse files")}</p>
                        <p className="text-sm text-muted-foreground/70">
                          {t("支持 MP4、MOV、AVI、WebM，最大 100MB", "Supports MP4, MOV, AVI, WebM - Max 100MB")}
                        </p>
                        <div className="mx-auto mt-3 max-w-sm rounded-md border border-border/70 bg-background/80 px-3 py-2 text-xs leading-5 text-muted-foreground">
                          {t("建议上传约 30 秒的单回合片段，分析效果更好。", "Best results: one exchange clip, around 30s.")}
                        </div>
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
                              {videoFile.status === "uploading"
                                ? t("上传中...", "Uploading...")
                                : t("分析中...", "Analyzing...")}
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
                              {analysisMode === "pose"
                                ? t("姿态分析完成", "Pose Analysis Complete")
                                : t("分析完成", "Analysis Complete")}
                            </span>
                          </div>

                          {analysisMode === "pose" && poseResult && (
                            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                              <h4 className="font-semibold">{t("姿态分析结果", "Pose Analysis Results")}</h4>
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                                  <p className="text-xs text-muted-foreground">{t("总帧数", "Total Frames")}</p>
                                  <p className="text-lg font-bold text-red-600">{poseResult.total_frames}</p>
                                </div>
                                <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
                                  <p className="text-xs text-muted-foreground">{t("已处理", "Processed")}</p>
                                  <p className="text-lg font-bold text-amber-600">{poseResult.processed_frames}</p>
                                </div>
                                <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                                  <p className="text-xs text-muted-foreground">{t("覆盖率", "Coverage")}</p>
                                  <p className="text-lg font-bold text-emerald-600">
                                    {poseResult.total_frames > 0
                                      ? `${Math.round((poseResult.processed_frames / poseResult.total_frames) * 100)}%`
                                      : "0%"}
                                  </p>
                                </div>
                              </div>
                              <div className="rounded-xl border border-border bg-background/70 p-4">
                                <div className="mb-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    {t("回放", "Replay")}
                                  </p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {t(
                                      "可使用骨架回放进行可视化复盘，原始姿态 JSON 默认不直接展示。",
                                      "Use the skeleton replay for visual review. Raw pose JSON is hidden from end users.",
                                    )}
                                  </p>
                                </div>
                                <Link
                                  href={videoFile?.id ? `/history/${videoFile.id}?view=skeleton` : "/history"}
                                  className="hover-lift inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-red-700"
                                >
                                  {t("打开完整历史详情", "Open Full History View")}
                                </Link>
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
                          <span>{t("上传失败，请重试。", "Upload failed. Please try again.")}</span>
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
                          {t("分析模式", "Analysis Mode")}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("选择这次上传的分析方式。", "Choose how this upload is processed.")}
                        </p>
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
                                <p className="font-medium">{isZh ? mode.labelZh : mode.labelEn}</p>
                                <p className="text-xs text-muted-foreground">
                                  {isZh ? mode.descriptionZh : mode.descriptionEn}
                                </p>
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
                          {t("武器类型", "Weapon Type")}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("将用于分析与教练问答的上下文。", "Used as context for analysis and coaching prompts.")}
                        </p>
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
                              {isZh ? getWeaponLabel(weapon.value, true) : weapon.label}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-border/70 bg-background/40 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {t("已选配置", "Selected profile")}
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
                    <span className="font-medium">
                      {showMetadataForm
                        ? t("隐藏", "Hide")
                        : t("显示", "Show")}{" "}
                      {t("对局信息（可选）", "match details (optional)")}
                    </span>
                  </button>

                  {showMetadataForm && (
                    <div className="glass-card space-y-6 rounded-3xl p-6">
                      <h4 className="text-lg font-semibold">{t("对局信息", "Match Details")}</h4>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">{t("标题", "Title")}</label>
                          <input
                            type="text"
                            value={metadata.title}
                            onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                            placeholder={t("例如：2024 区域锦标赛决赛", "e.g., 2024 Regional Championship Final")}
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">{t("运动员", "Athlete")}</label>
                          <input
                            type="text"
                            value={metadata.athlete}
                            onChange={(e) => setMetadata({ ...metadata, athlete: e.target.value })}
                            placeholder={t("你的姓名", "Your name")}
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">{t("对手", "Opponent")}</label>
                          <input
                            type="text"
                            value={metadata.opponent}
                            onChange={(e) => setMetadata({ ...metadata, opponent: e.target.value })}
                            placeholder={t("对手姓名", "Opponent name")}
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">{t("赛事", "Tournament")}</label>
                          <input
                            type="text"
                            value={metadata.tournament}
                            onChange={(e) => setMetadata({ ...metadata, tournament: e.target.value })}
                            placeholder={t("例如：全国锦标赛", "e.g., National Championships")}
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">{t("比赛结果", "Match Result")}</label>
                          <select
                            value={metadata.matchResult}
                            onChange={(e) => setMetadata({ ...metadata, matchResult: e.target.value })}
                            className="w-full rounded-xl border border-border bg-background p-3"
                          >
                            <option value="">{t("选择结果", "Select result")}</option>
                            <option value="win">{t("胜", "Win")}</option>
                            <option value="loss">{t("负", "Loss")}</option>
                            <option value="draw">{t("平", "Draw")}</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm text-muted-foreground">{t("比分", "Score")}</label>
                          <input
                            type="text"
                            value={metadata.score}
                            onChange={(e) => setMetadata({ ...metadata, score: e.target.value })}
                            placeholder={t("例如：15-12", "e.g., 15-12")}
                            className="w-full rounded-xl border border-border bg-background p-3"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {t("建议：上传约 30 秒的单回合视频，结果更稳定。", "Tip: use a single exchange clip around 30s.")}
                  </div>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!videoFile || videoFile.status === "uploading" || videoFile.status === "processing"}
                    className="hover-lift w-full rounded-2xl bg-red-600 py-5 text-lg font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {videoFile?.status === "uploading"
                      ? t("上传中...", "Uploading...")
                      : videoFile?.status === "processing"
                        ? t("分析中...", "Analyzing...")
                        : videoFile
                          ? t("开始分析", "Start Analysis")
                          : t("请先选择视频", "Select a video to start")}
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
                              ? "max-w-[80%] bg-red-600 p-5 text-white"
                              : "max-w-[88%] bg-secondary p-5 md:max-w-[82%]"
                          }`}
                        >
                          {message.role === "user" ? (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                          ) : (
                            <div>
                              <ChatMarkdown content={message.content} />
                              {(message.citations?.length || message.retrievalMeta?.degraded) && (
                                <div className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                                  {message.citations?.length ? (
                                    <div className="space-y-2">
                                      <p className="font-semibold text-foreground">{t("知识证据", "Knowledge Evidence")}</p>
                                      {message.citations.map((citation, citationIndex) => (
                                        <div
                                          key={`${citation.chunk_id}-${citationIndex}`}
                                          className="rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                                        >
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">
                                              {`K${citationIndex + 1}`}
                                            </span>
                                            <span className="font-medium text-foreground">{citation.title}</span>
                                            <span>{`${t("分数", "score")} ${citation.score.toFixed(2)}`}</span>
                                          </div>
                                          <p className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap">
                                            {citation.snippet}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {message.retrievalMeta?.degraded ? (
                                    <p className="mt-2 text-amber-600">
                                      {`${t("RAG 回退：", "RAG fallback: ")}${
                                        message.retrievalMeta.degrade_reason || t("检索降级", "retrieval degraded")
                                      }`}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </div>
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

                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${activeChatSessionMeta.badgeClass}`}
                        >
                          {activeChatSessionLabel}
                        </span>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {activeChatSessionTitle}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {activeChatSessionSubtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleNewChatSession}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold transition-colors hover:border-red-300 hover:text-red-600"
                    >
                      {t("新建会话", "New Session")}
                    </button>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {(chatSuggestedPrompts.length ? chatSuggestedPrompts : defaultQuickPrompts).map((prompt) => (
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

                  <div className="rounded-[28px] border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-end gap-3">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={t("输入你的问题...", "Type your question...")}
                        rows={2}
                        className="min-h-[72px] flex-1 resize-none bg-transparent px-2 py-1 text-lg leading-7 text-foreground placeholder:text-muted-foreground focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={!input.trim() || isTyping}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label={t("发送", "Send")}
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 12h14m-6-6 6 6-6 6" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-end text-[11px] font-medium text-muted-foreground">
                      <span>{t("Enter 发送 · Shift + Enter 换行", "Press Enter to send · Shift + Enter for a new line")}</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                    <p className="text-center text-xs leading-5 text-muted-foreground">
                      {t("AI 建议仅供训练参考。", "AI suggestions are for reference only.")}
                    </p>
                    {externalContextStatus && !activeChatVideoId ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t("当前来源：", "Current source: ")}
                        {externalContextStatus.label} ({externalContextStatus.window})
                      </p>
                    ) : null}
                    {isContextPreparing ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {pendingQueuedMessage
                          ? t(
                              "正在准备视频上下文... 准备完成后会自动发送你的消息。",
                              "Preparing video context... Your message will send automatically when ready.",
                            )
                          : t("正在准备视频上下文...", "Preparing video context...")}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              {activeTab === "history" && (
                <div className="space-y-5">
                  {!selectedHistoryVideoId && (
                    <div className="glass-card rounded-3xl border border-dashed border-border p-8 text-center">
                      <h3 className="mb-2 text-xl font-semibold">{t("选择一条历史记录", "Select a history record")}</h3>
                      <p className="text-muted-foreground">
                        {t(
                          "从左侧会话中选择一个视频，即可在这里查看姿态分析和报告详情。",
                          "Choose a video from the left sidebar to view pose analysis and report details here.",
                        )}
                      </p>
                    </div>
                  )}

                  {selectedHistoryVideoId && historyDetailLoading && (
                    <div className="glass-card rounded-3xl p-8">
                      <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
                          <p className="text-sm text-muted-foreground">{t("加载历史详情中...", "Loading history detail...")}</p>
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
                        {t("重试", "Retry")}
                      </button>
                    </div>
                  )}

                  {selectedHistoryVideoId && !historyDetailLoading && !historyDetailError && historyDetail && (
                    <>
                      <div className="glass-card rounded-3xl p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">{t("已选对局", "Selected Match")}</p>
                            <h2 className="mt-1 text-2xl font-bold">{historyDetail.title || t("未命名视频", "Untitled Video")}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {isZh ? "上传于 " : "Uploaded "}
                              {formatRelativeTime(historyDetail.upload_time, isZh)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/history/${selectedHistoryVideoId}`}
                              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-red-300 hover:bg-muted"
                            >
                              {t("打开完整历史页", "Open Full History Page")}
                            </Link>
                            <button
                              type="button"
                              onClick={handleAskAiAboutHistory}
                              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                            >
                              {t("就这场对局向 AI 提问", "Ask AI About This Match")}
                            </button>
                            <span
                              className="rounded-full px-3 py-1 text-sm font-semibold"
                              style={{
                                backgroundColor: `${getWeaponColor(historyDetail.weapon)}20`,
                                color: getWeaponColor(historyDetail.weapon),
                              }}
                            >
                              {getWeaponLabel(historyDetail.weapon, isZh)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-3">
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("运动员", "Athlete")}</p>
                            <p className="mt-1 font-semibold">{historyDetail.athlete || t("未知", "Unknown")}</p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("对手", "Opponent")}</p>
                            <p className="mt-1 font-semibold">{historyDetail.opponent || t("未知", "Unknown")}</p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("赛事", "Tournament")}</p>
                            <p className="mt-1 font-semibold">{historyDetail.tournament || t("未设置", "Not set")}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {getResultLabel(historyDetail.match_result, isZh) && (
                            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                              {isZh ? "结果：" : "Result: "}
                              {getResultLabel(historyDetail.match_result, isZh)}
                            </span>
                          )}
                          {historyDetail.score && (
                            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs text-secondary-foreground">
                              {t("比分：", "Score: ")}
                              {historyDetail.score}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="glass-card rounded-3xl p-6">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">{t("AI 分析报告", "AI Analysis Report")}</h3>
                            {historyPoseData ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("当前报告对象：", "Current report target: ")}
                                {getAthleteSlotLabel(selectedHistoryAthleteSlot)}
                                {t("。切换对象只会加载已保存报告。", ". Switching athlete only loads saved reports.")}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            {hasDualHistoryAthletes ? (
                              <div className="inline-flex rounded-xl border border-border bg-card p-1">
                                {historyAthleteSlots.map((slot) => (
                                  <button
                                    key={slot}
                                    type="button"
                                    onClick={() => setSelectedHistoryAthleteSlot(slot)}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                      selectedHistoryAthleteSlot === slot
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    {getAthleteSlotShortLabel(slot)}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {historyReportLoading && (
                          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                            <p className="text-sm text-muted-foreground">
                              {historyReportAction === "generate"
                                ? t("正在生成报告...", "Generating report...")
                                : t("正在加载已保存报告...", "Loading saved report...")}
                            </p>
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
                                {historyReport.cached ? t("缓存报告", "Cached report") : t("已保存报告", "Saved report")}
                              </span>
                              <span>
                                {isZh ? "更新于 " : "Updated "}
                                {formatRelativeTime(historyReport.updated_at, isZh)}
                              </span>
                            </div>
                            <ReportMarkdown content={historyReport.report} summary={historyReport.summary} />
                            {historyPoseData && (
                              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                                <p className="text-xs text-muted-foreground">
                                  {t("是否为以下对象重新分析：", "Need a fresh pass for ")}
                                  {getAthleteSlotLabel(selectedHistoryAthleteSlot)}
                                  {isZh ? "？" : "?"}
                                </p>
                                <button
                                  type="button"
                                  onClick={handleGenerateHistoryReport}
                                  disabled={historyReportLoading}
                                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {historyReportLoading && historyReportAction === "generate"
                                    ? t("重新生成中...", "Regenerating...")
                                    : isZh
                                      ? `重新生成 ${getAthleteSlotShortLabel(selectedHistoryAthleteSlot)} 报告`
                                      : `Regenerate ${getAthleteSlotShortLabel(selectedHistoryAthleteSlot)} Report`}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {!historyReport && !historyReportLoading && !historyReportError && !historyPoseData && (
                          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                            {t("该视频暂无姿态数据，请先执行姿态分析。", "No pose data available for this video yet. Run pose analysis first.")}
                          </div>
                        )}

                        {!historyReport && !historyReportLoading && !historyReportError && historyPoseData && (
                          <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-sm text-muted-foreground">
                              {t("未找到以下对象的已保存报告：", "No saved report found for ")}
                              {getAthleteSlotLabel(selectedHistoryAthleteSlot)}
                              {isZh ? "。" : "."}
                            </p>
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={handleGenerateHistoryReport}
                                disabled={historyReportLoading}
                                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isZh
                                  ? `生成 ${getAthleteSlotShortLabel(selectedHistoryAthleteSlot)} 报告`
                                  : `Generate ${getAthleteSlotShortLabel(selectedHistoryAthleteSlot)} Report`}
                              </button>
                            </div>
                          </div>
                        )}
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
            aria-label={t("关闭历史抽屉", "Close history drawer")}
          />

          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col border-r border-border bg-background p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{t("会话", "Sessions")}</p>
                <p className="text-xs text-muted-foreground">
                  {isZh ? `${chatSessions.length} 个线程` : `${chatSessions.length} threads`}
                </p>
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
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder={t("搜索会话...", "Search session...")}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
            </div>

            <div className="mb-3">
              <button
                type="button"
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                  handleNewChatSession();
                }}
                className="w-full rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:border-red-300 hover:text-red-600"
              >
                {t("新建会话", "New Session")}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">{renderSessionRows(false)}</div>
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

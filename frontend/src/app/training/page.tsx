"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { authFetch } from "@/lib/api";
import { useAppDialog } from "@/components/app-dialog-provider";
import { useLocale } from "@/lib/locale";

const TRAINING_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

const TRAINING_HANDOFF_STORAGE_KEY = "engarde.training.handoff";
const ANALYZE_WINDOW_DAYS = 14;
const WEEKDAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LABELS_ZH = ["日", "一", "二", "三", "四", "五", "六"] as const;

const RPE_LEVEL_GUIDE = [
  {
    range: "1-2",
    labelEn: "Very Easy",
    labelZh: "非常轻松",
    descriptionEn: "Recovery pace, almost no strain",
    descriptionZh: "恢复节奏，几乎无负担",
    color: "#22c55e",
  },
  {
    range: "3-4",
    labelEn: "Easy",
    labelZh: "轻松",
    descriptionEn: "Comfortable, can continue for long",
    descriptionZh: "较舒适，可持续较长时间",
    color: "#84cc16",
  },
  {
    range: "5-6",
    labelEn: "Moderate",
    labelZh: "中等",
    descriptionEn: "Focused effort, stable technique",
    descriptionZh: "专注发力，技术稳定",
    color: "#f59e0b",
  },
  {
    range: "7-8",
    labelEn: "Hard",
    labelZh: "困难",
    descriptionEn: "High stress, fatigue builds quickly",
    descriptionZh: "压力较高，疲劳累积快",
    color: "#f97316",
  },
  {
    range: "9-10",
    labelEn: "Max",
    labelZh: "极限",
    descriptionEn: "Near limit, short duration only",
    descriptionZh: "接近极限，仅能短时维持",
    color: "#ef4444",
  },
];

interface TrainingLogItem {
  id: string;
  training_date: string;
  start_time: string | null;
  duration_minutes: number;
  training_content: string;
  rpe: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TrainingLogListResponse {
  logs: TrainingLogItem[];
  total: number;
}

interface TrainingLogPayload {
  training_date: string;
  start_time: string | null;
  duration_minutes: number;
  training_content: string;
  rpe: number;
  notes: string | null;
}

interface TrainingHandoffPayload {
  context: string;
  summary: string;
  status: {
    source: "training";
    label: string;
    window: string;
    entry_count: number;
    updated_at: string;
  };
  suggested_prompts: string[];
  opening_message: string;
  auto_question?: string;
}

const formatDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseApiError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload?.detail) return payload.detail;
  } catch {
    return fallback;
  }
  return fallback;
};

const formatDisplayDate = (dateKey: string, isZh: boolean) => {
  const [year, month, day] = dateKey.split("-").map((item) => Number(item));
  const value = new Date(year, month - 1, day);
  const weekday = (isZh ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN)[value.getDay()] || "";
  if (isZh) {
    return `${value.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })} 周${weekday}`;
  }
  return `${value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${weekday}`;
};

const getMonthLabel = (value: Date, isZh: boolean) =>
  value.toLocaleDateString(isZh ? "zh-CN" : "en-US", { year: "numeric", month: "long" });

const sortLogsDesc = (a: TrainingLogItem, b: TrainingLogItem) => {
  if (a.training_date !== b.training_date) {
    return b.training_date.localeCompare(a.training_date);
  }
  if ((a.start_time || "") !== (b.start_time || "")) {
    return (b.start_time || "").localeCompare(a.start_time || "");
  }
  return b.updated_at.localeCompare(a.updated_at);
};

const sortDailyLogs = (a: TrainingLogItem, b: TrainingLogItem) => {
  if ((a.start_time || "") !== (b.start_time || "")) {
    return (a.start_time || "").localeCompare(b.start_time || "");
  }
  return b.updated_at.localeCompare(a.updated_at);
};

export default function TrainingPage() {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const { isZh } = useLocale();
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const t = useCallback(
    (zh: string, en: string) => (isZh ? zh : en),
    [isZh],
  );

  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [logs, setLogs] = useState<TrainingLogItem[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [pendingSelectionLogId, setPendingSelectionLogId] = useState<string | null>(null);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [isDateLoading, setIsDateLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPreparingAnalysis, setIsPreparingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [trainingContent, setTrainingContent] = useState("");
  const [rpe, setRpe] = useState(6);
  const [notes, setNotes] = useState("");

  const resetForm = useCallback(() => {
    setStartTime("");
    setDurationMinutes(60);
    setTrainingContent("");
    setRpe(6);
    setNotes("");
  }, []);

  const applyLogToForm = useCallback((log: TrainingLogItem) => {
    setStartTime(log.start_time ?? "");
    setDurationMinutes(log.duration_minutes ?? 0);
    setTrainingContent(log.training_content ?? "");
    setRpe(log.rpe ?? 6);
    setNotes(log.notes ?? "");
  }, []);

  const mergeLogsForDate = useCallback((dateKey: string, dateLogs: TrainingLogItem[]) => {
    setLogs((prev) => {
      const others = prev.filter((item) => item.training_date !== dateKey);
      return [...others, ...dateLogs].sort(sortLogsDesc);
    });
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      setIsLogsLoading(true);
      const response = await authFetch("/api/training/logs?limit=240");
      if (!response.ok) {
        const message = await parseApiError(response, t("加载训练记录失败", "Failed to load training logs"));
        throw new Error(message);
      }
      const payload = (await response.json()) as TrainingLogListResponse;
      setLogs((payload.logs || []).sort(sortLogsDesc));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("加载训练记录失败", "Failed to load training logs"));
    } finally {
      setIsLogsLoading(false);
    }
  }, [t]);

  const refreshSelectedDateEntries = useCallback(
    async (dateKey: string) => {
      try {
        setIsDateLoading(true);
        const response = await authFetch(`/api/training/logs?training_date=${dateKey}&limit=120`);
        if (!response.ok) {
          const message = await parseApiError(response, t("加载当日记录失败", "Failed to load selected date entries"));
          throw new Error(message);
        }
        const payload = (await response.json()) as TrainingLogListResponse;
        const dateLogs = (payload.logs || []).sort(sortDailyLogs);
        mergeLogsForDate(dateKey, dateLogs);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("加载当日记录失败", "Failed to load selected date entries"));
      } finally {
        setIsDateLoading(false);
      }
    },
    [mergeLogsForDate, t],
  );

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setSelectedLogId(null);
    setIsEditorExpanded(false);
    setSaveMessage(null);
    resetForm();
    void refreshSelectedDateEntries(selectedDateKey);
  }, [refreshSelectedDateEntries, resetForm, selectedDateKey]);

  const dailyLogs = useMemo(
    () => logs.filter((item) => item.training_date === selectedDateKey).sort(sortDailyLogs),
    [logs, selectedDateKey],
  );

  useEffect(() => {
    if (!pendingSelectionLogId) return;
    const target = dailyLogs.find((item) => item.id === pendingSelectionLogId);
    if (target) {
      setSelectedLogId(target.id);
      setIsEditorExpanded(true);
      applyLogToForm(target);
      setPendingSelectionLogId(null);
      return;
    }
    if (!isDateLoading) {
      setPendingSelectionLogId(null);
    }
  }, [applyLogToForm, dailyLogs, isDateLoading, pendingSelectionLogId]);

  const logsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of logs) {
      map.set(item.training_date, (map.get(item.training_date) || 0) + 1);
    }
    return map;
  }, [logs]);

  const summaryStats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    const sevenKey = formatDateKey(sevenDaysAgo);

    const recent = logs.filter((item) => item.training_date >= sevenKey);
    const totalMinutes = recent.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
    const avgRpe = recent.length
      ? recent.reduce((sum, item) => sum + (item.rpe || 0), 0) / recent.length
      : 0;

    return {
      sessions: recent.length,
      totalMinutes,
      avgRpe,
    };
  }, [logs]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{
      dateKey: string;
      dayLabel: number;
      inCurrentMonth: boolean;
    }> = [];

    for (let idx = firstWeekday - 1; idx >= 0; idx -= 1) {
      const day = daysInPrevMonth - idx;
      const value = new Date(year, month - 1, day);
      cells.push({
        dateKey: formatDateKey(value),
        dayLabel: day,
        inCurrentMonth: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const value = new Date(year, month, day);
      cells.push({
        dateKey: formatDateKey(value),
        dayLabel: day,
        inCurrentMonth: true,
      });
    }

    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day += 1) {
      const value = new Date(year, month + 1, day);
      cells.push({
        dateKey: formatDateKey(value),
        dayLabel: day,
        inCurrentMonth: false,
      });
    }

    return cells;
  }, [calendarMonth]);

  const startCreateNewEntry = useCallback(() => {
    setSelectedLogId(null);
    setPendingSelectionLogId(null);
    setIsEditorExpanded(true);
    setSaveMessage(null);
    setError(null);
    resetForm();
  }, [resetForm]);

  const handleSelectEntry = useCallback(
    (item: TrainingLogItem) => {
      setSelectedLogId(item.id);
      setPendingSelectionLogId(null);
      setIsEditorExpanded(true);
      setSaveMessage(null);
      setError(null);
      applyLogToForm(item);
    },
    [applyLogToForm],
  );

  const handleSave = useCallback(async () => {
    if (!trainingContent.trim()) {
      setError(t("请先填写训练内容再保存。", "Please fill in training content before saving."));
      return;
    }

    const payload: TrainingLogPayload = {
      training_date: selectedDateKey,
      start_time: startTime || null,
      duration_minutes: durationMinutes,
      training_content: trainingContent.trim(),
      rpe,
      notes: notes.trim() || null,
    };

    const isEditing = Boolean(selectedLogId);
    const path = isEditing ? `/api/training/logs/${selectedLogId}` : "/api/training/logs";
    const method = isEditing ? "PUT" : "POST";

    try {
      setIsSaving(true);
      const response = await authFetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await parseApiError(response, t("保存训练记录失败", "Failed to save training log"));
        throw new Error(message);
      }

      const savedLog = (await response.json()) as TrainingLogItem;
      setSelectedLogId(savedLog.id);
      applyLogToForm(savedLog);
      setSaveMessage(isEditing ? t("已更新", "Updated") : t("已保存", "Saved"));
      setError(null);

      await refreshSelectedDateEntries(selectedDateKey);
      await loadLogs();
    } catch (err) {
      setSaveMessage(null);
      setError(err instanceof Error ? err.message : t("保存训练记录失败", "Failed to save training log"));
    } finally {
      setIsSaving(false);
    }
  }, [
    applyLogToForm,
    durationMinutes,
    loadLogs,
    notes,
    refreshSelectedDateEntries,
    rpe,
    selectedDateKey,
    selectedLogId,
    startTime,
    t,
    trainingContent,
  ]);

  const handleDelete = useCallback(async () => {
    if (!selectedLogId) return;
    const confirmed = await confirm({
      title: t("删除这条训练记录？", "Delete this training entry?"),
      description: t("此操作不可撤销。", "This action cannot be undone."),
      confirmText: t("删除", "Delete"),
      cancelText: t("取消", "Cancel"),
      danger: true,
    });
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const response = await authFetch(`/api/training/logs/${selectedLogId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await parseApiError(response, t("删除训练记录失败", "Failed to delete training log"));
        throw new Error(message);
      }

      setSelectedLogId(null);
      setSaveMessage(t("已删除记录", "Deleted entry"));
      setError(null);
      resetForm();
      await refreshSelectedDateEntries(selectedDateKey);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("删除训练记录失败", "Failed to delete training log"));
    } finally {
      setIsDeleting(false);
    }
  }, [confirm, loadLogs, refreshSelectedDateEntries, resetForm, selectedDateKey, selectedLogId, t]);

  const handleCloseEditor = useCallback(() => {
    setIsEditorExpanded(false);
    setError(null);
    setSaveMessage(null);
    setPendingSelectionLogId(null);
    setSelectedLogId(null);
  }, []);

  const handleAnalyzeRecentTraining = useCallback(async () => {
    try {
      setIsPreparingAnalysis(true);

      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - (ANALYZE_WINDOW_DAYS - 1));

      const startKey = formatDateKey(start);
      const endKey = formatDateKey(end);
      const response = await authFetch(
        `/api/training/logs?start_date=${startKey}&end_date=${endKey}&limit=240`,
      );

      if (!response.ok) {
        const message = await parseApiError(
          response,
          t("准备训练分析上下文失败", "Failed to prepare training analysis context"),
        );
        throw new Error(message);
      }

      const payload = (await response.json()) as TrainingLogListResponse;
      const logsForAnalysis = (payload.logs || []).sort((a, b) => {
        if (a.training_date !== b.training_date) return a.training_date.localeCompare(b.training_date);
        return (a.start_time || "").localeCompare(b.start_time || "");
      });

      if (logsForAnalysis.length === 0) {
        setError(t("最近时间窗内暂无训练记录，请先添加至少一条训练。", "No training logs in the recent window. Add at least one session first."));
        return;
      }

      const totalMinutes = logsForAnalysis.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
      const avgRpe =
        logsForAnalysis.reduce((sum, item) => sum + (item.rpe || 0), 0) / logsForAnalysis.length;

      const contextPack = {
        source: "training_logs",
        generated_at: new Date().toISOString(),
        window_days: ANALYZE_WINDOW_DAYS,
        stats: {
          total_sessions: logsForAnalysis.length,
          total_minutes: totalMinutes,
          average_rpe: Number(avgRpe.toFixed(2)),
        },
        sessions: logsForAnalysis.map((item) => ({
          date: item.training_date,
          start_time: item.start_time,
          duration_minutes: item.duration_minutes,
          rpe: item.rpe,
          training_content: item.training_content,
          notes: item.notes,
        })),
      };

      const summary = [
        t(`时间窗：最近 ${ANALYZE_WINDOW_DAYS} 天`, `Window: last ${ANALYZE_WINDOW_DAYS} days`),
        t(`记录数：${logsForAnalysis.length}`, `Entries: ${logsForAnalysis.length}`),
        t(`总时长：${totalMinutes} 分钟`, `Total duration: ${totalMinutes} minutes`),
        t(`平均 RPE：${avgRpe.toFixed(1)}`, `Average RPE: ${avgRpe.toFixed(1)}`),
      ].join("\n");

      const handoff: TrainingHandoffPayload = {
        context: JSON.stringify(contextPack),
        summary,
        status: {
          source: "training",
          label: t("近期训练记录", "Recent training logs"),
          window: t(`${ANALYZE_WINDOW_DAYS} 天`, `${ANALYZE_WINDOW_DAYS} days`),
          entry_count: logsForAnalysis.length,
          updated_at: new Date().toISOString(),
        },
        suggested_prompts: [
          t("评估我最近的疲劳状态，并给出下周训练负荷建议。", "Evaluate my recent fatigue and suggest next week's load progression."),
          t("基于最近训练记录，分析我当前的疲劳情况。", "Analyze my current fatigue status based on recent logs."),
          t("为我接下来 7 天推荐训练负荷调整方案。", "Recommend load adjustment for my next 7 days."),
          t("识别是否有过度训练风险，并给出恢复优先项。", "Identify overreaching risk and recovery priorities."),
          t("为明天建议一节聚焦技术训练。", "Suggest a focused technical session for tomorrow."),
        ],
        opening_message: t(
          `训练上下文已附加（${logsForAnalysis.length} 条记录，最近 ${ANALYZE_WINDOW_DAYS} 天）。你可以让我分析疲劳并给出下一步训练建议。`,
          `Training context is attached (${logsForAnalysis.length} entries, last ${ANALYZE_WINDOW_DAYS} days). Ask for fatigue and next-step training advice.`,
        ),
        auto_question: t(
          "评估我最近的疲劳状态，并给出下周训练负荷建议。",
          "Evaluate my recent fatigue and suggest next week's load progression.",
        ),
      };

      window.localStorage.setItem(TRAINING_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
      router.push("/analyze?training_context=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("准备训练分析上下文失败", "Failed to prepare training analysis context"));
    } finally {
      setIsPreparingAnalysis(false);
    }
  }, [router, t]);

  const selectedMonth = calendarMonth.getMonth();
  const selectedYear = calendarMonth.getFullYear();

  return (
    <div className="min-h-screen bg-background">
      <TopNav activeHref="/training" links={[...TRAINING_NAV_LINKS]} />

      <main className="pt-28 pb-12">
        <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm text-muted-foreground">{t("记录数（7天）", "Entries (7d)")}</p>
              <p className="text-3xl font-bold mt-1">{summaryStats.sessions}</p>
            </div>
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm text-muted-foreground">{t("总时长（分钟，7天）", "Total Minutes (7d)")}</p>
              <p className="text-3xl font-bold mt-1">{summaryStats.totalMinutes}</p>
            </div>
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm text-muted-foreground">{t("平均 RPE（7天）", "Average RPE (7d)")}</p>
              <p className="text-3xl font-bold mt-1">{summaryStats.avgRpe.toFixed(1)}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
            <section className="glass-card rounded-3xl p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(selectedYear, selectedMonth - 1, 1))}
                  className="h-9 w-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                  aria-label={t("上个月", "Previous month")}
                >
                  <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <p className="text-lg font-semibold">{getMonthLabel(calendarMonth, isZh)}</p>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(selectedYear, selectedMonth + 1, 1))}
                  className="h-9 w-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                  aria-label={t("下个月", "Next month")}
                >
                  <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-7 mb-2 text-xs font-semibold text-muted-foreground">
                {(isZh ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN).map((weekday) => (
                  <div key={weekday} className="text-center py-2">
                    {isZh ? `周${weekday}` : weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell) => {
                  const count = logsByDate.get(cell.dateKey) || 0;
                  const selected = selectedDateKey === cell.dateKey;
                  const today = todayKey === cell.dateKey;

                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() => setSelectedDateKey(cell.dateKey)}
                      className={`relative rounded-xl border p-2 text-sm transition-all ${
                        selected
                          ? "border-red-500 bg-red-50 text-red-700"
                          : cell.inCurrentMonth
                            ? "border-border bg-card hover:border-red-300"
                            : "border-border/40 bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <span className={`font-semibold ${today && !selected ? "text-red-600" : ""}`}>
                        {cell.dayLabel}
                      </span>
                      {count > 0 && (
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("选择日期", "Selected Date")}</p>
                <p className="mt-1 text-base font-semibold">{formatDisplayDate(selectedDateKey, isZh)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isZh
                    ? `${dailyLogs.length} 条记录`
                    : `${dailyLogs.length} entr${dailyLogs.length === 1 ? "y" : "ies"} on this day`}
                </p>
                {isDateLoading && <p className="mt-2 text-xs text-muted-foreground">{t("正在加载记录...", "Loading entries...")}</p>}
              </div>

              <button
                type="button"
                onClick={handleAnalyzeRecentTraining}
                disabled={isPreparingAnalysis}
                className="mt-4 w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {isPreparingAnalysis
                  ? t("准备训练上下文中...", "Preparing Training Context...")
                  : t("在 AI 教练中分析近期训练", "Analyze Recent Training in AI Coach")}
              </button>

              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">{t("近期记录", "Recent Entries")}</p>
                {isLogsLoading ? (
                  <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                    {t("加载记录中...", "Loading records...")}
                  </div>
                ) : logs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                    {t("暂无记录，先从今天开始。", "No logs yet. Start with today.")}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {logs.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSaveMessage(null);
                          setError(null);
                          if (item.training_date === selectedDateKey) {
                            handleSelectEntry(item);
                            return;
                          }
                          setPendingSelectionLogId(item.id);
                          setSelectedDateKey(item.training_date);
                        }}
                        className={`w-full rounded-xl border p-3 text-left transition-all ${
                          selectedLogId === item.id
                            ? "border-red-300 bg-red-50/80"
                            : "border-border bg-card hover:border-red-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">
                            {formatDisplayDate(item.training_date, isZh)} · {item.start_time || t("未填写时间", "No time")}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {isZh ? `${item.duration_minutes} 分钟 · RPE ${item.rpe}` : `${item.duration_minutes} min · RPE ${item.rpe}`}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{item.training_content}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="glass-card rounded-3xl p-5 md:p-6">
              <div className="mb-4">
                <h1 className="text-2xl md:text-3xl font-bold">{t("每日训练日志", "Daily Training Log")}</h1>
                <p className="text-muted-foreground mt-1">
                  {t("支持同一天多条记录。点击某条记录即可编辑。", "Multiple entries per day are supported. Click an entry to edit it.")}
                </p>
              </div>

              <div className="mb-4 rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {t("当日记录", "Entries on")} {formatDisplayDate(selectedDateKey, isZh)}
                  </p>
                  <button
                    type="button"
                    onClick={startCreateNewEntry}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {t("新建记录", "New Entry")}
                  </button>
                </div>

                {isDateLoading ? (
                  <p className="text-sm text-muted-foreground">{t("加载记录中...", "Loading entries...")}</p>
                ) : dailyLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("该日期暂无记录。", "No entries yet for this day.")}</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {dailyLogs.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectEntry(item)}
                        className={`w-full rounded-xl border p-3 text-left transition-all ${
                          selectedLogId === item.id
                            ? "border-red-300 bg-red-50/80"
                            : "border-border bg-background hover:border-red-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">
                            {t("记录", "Entry")} {index + 1} · {item.start_time || t("未填写开始时间", "No start time")}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {isZh ? `${item.duration_minutes} 分钟 · RPE ${item.rpe}` : `${item.duration_minutes} min · RPE ${item.rpe}`}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{item.training_content}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">
                  {selectedLogId ? t("正在编辑所选记录", "Editing selected entry") : t("正在创建新记录", "Creating new entry")}
                </p>
                {selectedLogId && (
                  <button
                    type="button"
                    onClick={startCreateNewEntry}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    {t("切换为新建记录", "Switch to New Entry")}
                  </button>
                )}
              </div>

              {!isEditorExpanded && (
                <div className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  {t("点击 ", "Click ")}
                  <span className="font-semibold text-foreground">{t("新建记录", "New Entry")}</span>
                  {t(" 或选择已有记录以展开编辑器。", " or select an existing record to expand the editor.")}
                </div>
              )}

              {isEditorExpanded && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-muted-foreground">{t("开始时间", "Start Time")}</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-muted-foreground">{t("时长（分钟）", "Duration (minutes)")}</label>
                      <input
                        type="number"
                        min={0}
                        max={720}
                        value={durationMinutes}
                        onChange={(event) => setDurationMinutes(Number(event.target.value))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm text-muted-foreground">{t("训练内容", "Training Content")}</label>
                    <textarea
                      value={trainingContent}
                      onChange={(event) => setTrainingContent(event.target.value)}
                      placeholder={t(
                        "示例：步法梯训练、6x5 弓步、格挡反击训练、实战笔记...",
                        "Example: Footwork ladder, 6x5 lunge reps, parry-riposte drills, sparring notes...",
                      )}
                      rows={5}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                    />
                  </div>

                  <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-muted-foreground">{t("主观 RPE（1-10）", "Subjective RPE (1-10)")}</label>
                        <div className="group relative">
                          <button
                            type="button"
                            aria-label={t("显示 RPE 量表说明", "Show RPE scale guide")}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-muted-foreground transition-colors hover:border-red-300 hover:text-foreground"
                          >
                            i
                          </button>
                          <div className="invisible absolute left-full top-1/2 z-20 ml-3 w-[360px] -translate-y-1/2 translate-x-1 rounded-2xl border border-border bg-background/95 p-4 opacity-0 shadow-2xl backdrop-blur transition-all duration-150 group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("RPE 说明", "RPE Guide")}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {t(
                                "请按本次训练主观整体强度打分（1=非常轻松，10=极限强度）。",
                                "Rate how hard the session felt overall (1 = very easy, 10 = max effort).",
                              )}
                            </p>
                            <div className="mt-3 rounded-xl border border-border/70 bg-card/80 overflow-hidden">
                              {RPE_LEVEL_GUIDE.map((item, index) => (
                                <div
                                  key={`${item.range}-${item.labelEn}`}
                                  className={`flex items-start gap-3 px-3 py-2.5 ${index > 0 ? "border-t border-border/60" : ""}`}
                                >
                                  <span
                                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  <span
                                    className="min-w-[48px] whitespace-nowrap rounded-md px-1.5 py-0.5 text-center text-xs font-semibold"
                                    style={{ backgroundColor: `${item.color}22`, color: item.color }}
                                  >
                                    {item.range}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-foreground">{isZh ? item.labelZh : item.labelEn}</p>
                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                      {isZh ? item.descriptionZh : item.descriptionEn}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">{rpe}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={rpe}
                      onChange={(event) => setRpe(Number(event.target.value))}
                      className="mt-3 w-full accent-red-600"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("非常轻松", "Very Easy")}</span>
                      <span>{t("极限强度", "Max Effort")}</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm text-muted-foreground">{t("训练后备注", "Post-Training Notes")}</label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder={t(
                        "示例：实战后双腿疲劳，右肩有紧张感，今晚优先保证睡眠...",
                        "Example: Legs heavy after sparring, right shoulder tightness, sleep target tonight...",
                      )}
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                    />
                  </div>

                  {(error || saveMessage) && (
                    <div
                      className={`mt-4 rounded-xl border p-3 text-sm ${
                        error
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-green-200 bg-green-50 text-green-700"
                      }`}
                    >
                      {error || saveMessage}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                    >
                      {isSaving
                        ? t("保存中...", "Saving...")
                        : selectedLogId
                          ? t("更新记录", "Update Entry")
                          : t("保存记录", "Save Entry")}
                    </button>
                <button
                  type="button"
                  onClick={selectedLogId ? handleDelete : handleCloseEditor}
                  disabled={isDeleting || isSaving}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
                >
                  {isDeleting ? t("删除中...", "Deleting...") : selectedLogId ? t("删除记录", "Delete Entry") : t("关闭", "Close")}
                </button>
              </div>
                </>
              )}

            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

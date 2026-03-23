"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { authFetch } from "@/lib/api";

const TRAINING_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

const TRAINING_HANDOFF_STORAGE_KEY = "engarde.training.handoff";
const ANALYZE_WINDOW_DAYS = 14;
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

const RPE_LEVEL_GUIDE = [
  { range: "1-2", label: "Very Easy", description: "Recovery pace, almost no strain", color: "#22c55e" },
  { range: "3-4", label: "Easy", description: "Comfortable, can continue for long", color: "#84cc16" },
  { range: "5-6", label: "Moderate", description: "Focused effort, stable technique", color: "#f59e0b" },
  { range: "7-8", label: "Hard", description: "High stress, fatigue builds quickly", color: "#f97316" },
  { range: "9-10", label: "Max", description: "Near limit, short duration only", color: "#ef4444" },
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

const formatDisplayDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map((item) => Number(item));
  const value = new Date(year, month - 1, day);
  const weekday = WEEKDAY_LABELS[value.getDay()] || "";
  return `${year}年${month}月${day}日 ${weekday}`;
};

const getMonthLabel = (value: Date) => `${value.getFullYear()}年${value.getMonth() + 1}月`;

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
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

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
        const message = await parseApiError(response, "Failed to load training logs");
        throw new Error(message);
      }
      const payload = (await response.json()) as TrainingLogListResponse;
      setLogs((payload.logs || []).sort(sortLogsDesc));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load training logs");
    } finally {
      setIsLogsLoading(false);
    }
  }, []);

  const refreshSelectedDateEntries = useCallback(
    async (dateKey: string) => {
      try {
        setIsDateLoading(true);
        const response = await authFetch(`/api/training/logs?training_date=${dateKey}&limit=120`);
        if (!response.ok) {
          const message = await parseApiError(response, "Failed to load selected date entries");
          throw new Error(message);
        }
        const payload = (await response.json()) as TrainingLogListResponse;
        const dateLogs = (payload.logs || []).sort(sortDailyLogs);
        mergeLogsForDate(dateKey, dateLogs);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load selected date entries");
      } finally {
        setIsDateLoading(false);
      }
    },
    [mergeLogsForDate],
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
      setError("Please fill in training content before saving.");
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
        const message = await parseApiError(response, "Failed to save training log");
        throw new Error(message);
      }

      const savedLog = (await response.json()) as TrainingLogItem;
      setSelectedLogId(savedLog.id);
      applyLogToForm(savedLog);
      setSaveMessage(isEditing ? "Updated" : "Saved");
      setError(null);

      await refreshSelectedDateEntries(selectedDateKey);
      await loadLogs();
    } catch (err) {
      setSaveMessage(null);
      setError(err instanceof Error ? err.message : "Failed to save training log");
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
    trainingContent,
  ]);

  const handleDelete = useCallback(async () => {
    if (!selectedLogId) return;
    if (!window.confirm("Delete this training entry? This action cannot be undone.")) return;

    try {
      setIsDeleting(true);
      const response = await authFetch(`/api/training/logs/${selectedLogId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await parseApiError(response, "Failed to delete training log");
        throw new Error(message);
      }

      setSelectedLogId(null);
      setSaveMessage("Deleted entry");
      setError(null);
      resetForm();
      await refreshSelectedDateEntries(selectedDateKey);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete training log");
    } finally {
      setIsDeleting(false);
    }
  }, [loadLogs, refreshSelectedDateEntries, resetForm, selectedDateKey, selectedLogId]);

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
        const message = await parseApiError(response, "Failed to prepare training analysis context");
        throw new Error(message);
      }

      const payload = (await response.json()) as TrainingLogListResponse;
      const logsForAnalysis = (payload.logs || []).sort((a, b) => {
        if (a.training_date !== b.training_date) return a.training_date.localeCompare(b.training_date);
        return (a.start_time || "").localeCompare(b.start_time || "");
      });

      if (logsForAnalysis.length === 0) {
        setError("No training logs in the recent window. Add at least one session first.");
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
        `Window: last ${ANALYZE_WINDOW_DAYS} days`,
        `Entries: ${logsForAnalysis.length}`,
        `Total duration: ${totalMinutes} minutes`,
        `Average RPE: ${avgRpe.toFixed(1)}`,
      ].join("\n");

      const handoff: TrainingHandoffPayload = {
        context: JSON.stringify(contextPack),
        summary,
        status: {
          source: "training",
          label: "Recent training logs",
          window: `${ANALYZE_WINDOW_DAYS} days`,
          entry_count: logsForAnalysis.length,
          updated_at: new Date().toISOString(),
        },
        suggested_prompts: [
          "评估我最近疲劳和下周负荷安排。",
          "Analyze my current fatigue status based on recent logs.",
          "Recommend load adjustment for my next 7 days.",
          "Identify overreaching risk and recovery priorities.",
          "Suggest a focused technical session for tomorrow.",
        ],
        opening_message:
          `Training context is attached (${logsForAnalysis.length} entries, ` +
          `last ${ANALYZE_WINDOW_DAYS} days). Ask for fatigue and next-step training advice.`,
        auto_question: "评估我最近疲劳和下周负荷安排。",
      };

      window.localStorage.setItem(TRAINING_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
      router.push("/analyze?training_context=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare training analysis context");
    } finally {
      setIsPreparingAnalysis(false);
    }
  }, [router]);

  const selectedMonth = calendarMonth.getMonth();
  const selectedYear = calendarMonth.getFullYear();

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[80px]" />
      </div>

      <TopNav activeHref="/training" links={[...TRAINING_NAV_LINKS]} />

      <main className="pt-28 pb-12">
        <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm text-muted-foreground">Entries (7d)</p>
              <p className="text-3xl font-bold mt-1">{summaryStats.sessions}</p>
            </div>
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm text-muted-foreground">Total Minutes (7d)</p>
              <p className="text-3xl font-bold mt-1">{summaryStats.totalMinutes}</p>
            </div>
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm text-muted-foreground">Average RPE (7d)</p>
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
                  aria-label="Previous month"
                >
                  <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <p className="text-lg font-semibold">{getMonthLabel(calendarMonth)}</p>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(selectedYear, selectedMonth + 1, 1))}
                  className="h-9 w-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                  aria-label="Next month"
                >
                  <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-7 mb-2 text-xs font-semibold text-muted-foreground">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                  <div key={weekday} className="text-center py-2">
                    {weekday}
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
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected Date</p>
                <p className="mt-1 text-base font-semibold">{formatDisplayDate(selectedDateKey)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dailyLogs.length} entr{dailyLogs.length === 1 ? "y" : "ies"} on this day
                </p>
                {isDateLoading && <p className="mt-2 text-xs text-muted-foreground">Loading entries...</p>}
              </div>

              <button
                type="button"
                onClick={handleAnalyzeRecentTraining}
                disabled={isPreparingAnalysis}
                className="mt-4 w-full rounded-2xl bg-gradient-to-r from-red-600 to-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isPreparingAnalysis ? "Preparing Training Context..." : "Analyze Recent Training in AI Coach"}
              </button>

              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">Recent Entries</p>
                {isLogsLoading ? (
                  <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                    Loading records...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                    No logs yet. Start with today.
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
                            {formatDisplayDate(item.training_date)} · {item.start_time || "No time"}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {item.duration_minutes} min · RPE {item.rpe}
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
                <h1 className="text-2xl md:text-3xl font-bold">Daily Training Log</h1>
                <p className="text-muted-foreground mt-1">
                  Multiple entries per day are supported. Click an entry to edit it.
                </p>
              </div>

              <div className="mb-4 rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Entries on {formatDisplayDate(selectedDateKey)}</p>
                  <button
                    type="button"
                    onClick={startCreateNewEntry}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    New Entry
                  </button>
                </div>

                {isDateLoading ? (
                  <p className="text-sm text-muted-foreground">Loading entries...</p>
                ) : dailyLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No entries yet for this day.</p>
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
                            Entry {index + 1} · {item.start_time || "No start time"}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {item.duration_minutes} min · RPE {item.rpe}
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
                  {selectedLogId ? "Editing selected entry" : "Creating new entry"}
                </p>
                {selectedLogId && (
                  <button
                    type="button"
                    onClick={startCreateNewEntry}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Switch to New Entry
                  </button>
                )}
              </div>

              {!isEditorExpanded && (
                <div className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Click <span className="font-semibold text-foreground">New Entry</span> or select an existing record
                  to expand the editor.
                </div>
              )}

              {isEditorExpanded && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-muted-foreground">Start Time</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-muted-foreground">Duration (minutes)</label>
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
                    <label className="mb-2 block text-sm text-muted-foreground">Training Content</label>
                    <textarea
                      value={trainingContent}
                      onChange={(event) => setTrainingContent(event.target.value)}
                      placeholder="Example: Footwork ladder, 6x5 lunge reps, parry-riposte drills, sparring notes..."
                      rows={5}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
                    />
                  </div>

                  <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-muted-foreground">Subjective RPE (1-10)</label>
                        <div className="group relative">
                          <button
                            type="button"
                            aria-label="Show RPE scale guide"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-muted-foreground transition-colors hover:border-red-300 hover:text-foreground"
                          >
                            i
                          </button>
                          <div className="invisible absolute left-full top-1/2 z-20 ml-3 w-[360px] -translate-y-1/2 translate-x-1 rounded-2xl border border-border bg-background/95 p-4 opacity-0 shadow-2xl backdrop-blur transition-all duration-150 group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RPE Guide</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Rate how hard the session felt overall (1 = very easy, 10 = max effort).
                            </p>
                            <div className="mt-3 rounded-xl border border-border/70 bg-card/80 overflow-hidden">
                              {RPE_LEVEL_GUIDE.map((item, index) => (
                                <div
                                  key={`${item.range}-${item.label}`}
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
                                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                                    <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
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
                      <span>Very Easy</span>
                      <span>Max Effort</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm text-muted-foreground">Post-Training Notes</label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Example: Legs heavy after sparring, right shoulder tightness, sleep target tonight..."
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
                      className="rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : selectedLogId ? "Update Entry" : "Save Entry"}
                    </button>
                <button
                  type="button"
                  onClick={selectedLogId ? handleDelete : handleCloseEditor}
                  disabled={isDeleting || isSaving}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
                >
                  {isDeleting ? "Deleting..." : selectedLogId ? "Delete Entry" : "Close"}
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

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ensureAnalysisReport,
  parseAnalysisReportCacheKey,
  readCachedAnalysisReport,
  resumeLatestAnalysisReportJob,
  startAnalysisReportJob,
  waitForAnalysisReportJob,
} from "@/lib/analysis-report";
import { authFetch, buildAuthedApiUrl } from "@/lib/api";
import {
  getAthleteSlotLabel,
  getAthleteSlotShortLabel,
  getAvailableAthleteSlots,
  getDefaultAthleteSlot,
  getSlotPoseFrames,
  hasDualAthletePose,
  readPoseLandmark,
  type AthleteSlot,
  type PoseData,
  type SlotPoseFrame,
} from "@/lib/pose-data";
import { waitForPoseAnalysisJob } from "@/lib/pose-analysis-job";
import { ReportMarkdown } from "@/components/report-markdown";
import { TopNav } from "@/components/top-nav";
import { useLocale } from "@/lib/locale";

const HISTORY_DETAIL_NAV_LINKS = [
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
  report_status?: string;
}

interface AnalysisReport {
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

type ReplayMode = "original" | "skeleton";

type HandSide = "left" | "right";
type DominantSideMode = "auto" | HandSide;

interface PoseOverlayPrepareResponse {
  video_id: string;
  overlay_video_path?: string | null;
  message?: string;
  status?: string;
  job_id?: string | null;
}

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError");

const POSE_INDEX = {
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
} as const;

const POSE_CONFIDENCE_THRESHOLD = 0.45;
const METRIC_EMA_ALPHA = 0.5;

const METRIC_KEYS = [
  "trackingQuality",
  "stanceWidthIndex",
  "weaponArmExtension",
  "guardHeight",
  "handSpeed",
  "leadKneeAngle",
  "rearKneeAngle",
  "weaponArmElbowAngle",
  "torsoLeanAngle",
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

interface MetricSample {
  value: number | null;
  confidence: number | null;
  lowConfidence: boolean;
}

type FrameMetricSample = Record<MetricKey, MetricSample>;

interface MetricBaseline {
  p25: number;
  p75: number;
}

type MetricBaselines = Partial<Record<MetricKey, MetricBaseline>>;

interface MetricConfig {
  label: string;
  hint: string;
  lowLabel: string;
  midLabel: string;
  highLabel: string;
}

const METRIC_CONFIG: Record<MetricKey, MetricConfig> = {
  trackingQuality: {
    label: "Tracking Quality",
    hint: "Average visibility of the 33 tracked points.",
    lowLabel: "Low",
    midLabel: "Stable",
    highLabel: "High",
  },
  stanceWidthIndex: {
    label: "Stance Width Index",
    hint: "Ankle distance normalized by shoulder width.",
    lowLabel: "Narrow",
    midLabel: "Balanced",
    highLabel: "Wide",
  },
  weaponArmExtension: {
    label: "Weapon Arm Extension",
    hint: "Weapon-side wrist to shoulder distance (normalized).",
    lowLabel: "Short",
    midLabel: "Ready",
    highLabel: "Long",
  },
  guardHeight: {
    label: "Guard Height",
    hint: "Weapon-side hand height relative to shoulder center.",
    lowLabel: "Low Guard",
    midLabel: "Neutral",
    highLabel: "High Guard",
  },
  handSpeed: {
    label: "Hand Speed",
    hint: "Weapon-side wrist speed, normalized per second.",
    lowLabel: "Slow",
    midLabel: "Controlled",
    highLabel: "Fast",
  },
  leadKneeAngle: {
    label: "Lead Knee Angle",
    hint: "Hip-knee-ankle angle on the weapon side.",
    lowLabel: "Deep Bend",
    midLabel: "Loaded",
    highLabel: "Extended",
  },
  rearKneeAngle: {
    label: "Rear Knee Angle",
    hint: "Hip-knee-ankle angle on the rear side.",
    lowLabel: "Deep Bend",
    midLabel: "Loaded",
    highLabel: "Extended",
  },
  weaponArmElbowAngle: {
    label: "Weapon Arm Elbow Angle",
    hint: "Shoulder-elbow-wrist angle on weapon side.",
    lowLabel: "Bent",
    midLabel: "Loaded",
    highLabel: "Extended",
  },
  torsoLeanAngle: {
    label: "Torso Lean Angle",
    hint: "Shoulder-hip line lean from vertical.",
    lowLabel: "Upright",
    midLabel: "Neutral Lean",
    highLabel: "Deep Lean",
  },
};

interface LandmarkPoint {
  x: number;
  y: number;
  z: number | null;
  visibility: number | null;
}

const createMetricSample = (): MetricSample => ({
  value: null,
  confidence: null,
  lowConfidence: false,
});

const createEmptyFrameMetricSample = (): FrameMetricSample => ({
  trackingQuality: createMetricSample(),
  stanceWidthIndex: createMetricSample(),
  weaponArmExtension: createMetricSample(),
  guardHeight: createMetricSample(),
  handSpeed: createMetricSample(),
  leadKneeAngle: createMetricSample(),
  rearKneeAngle: createMetricSample(),
  weaponArmElbowAngle: createMetricSample(),
  torsoLeanAngle: createMetricSample(),
});

const average = (values: number[]): number | null => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const distance2d = (a: LandmarkPoint, b: LandmarkPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const angleAtPointDegrees = (a: LandmarkPoint, b: LandmarkPoint, c: LandmarkPoint): number | null => {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;

  const baNorm = Math.hypot(baX, baY);
  const bcNorm = Math.hypot(bcX, bcY);
  if (baNorm <= Number.EPSILON || bcNorm <= Number.EPSILON) {
    return null;
  }

  const cosine = Math.max(-1, Math.min(1, (baX * bcX + baY * bcY) / (baNorm * bcNorm)));
  return (Math.acos(cosine) * 180) / Math.PI;
};

const quantile = (values: number[], q: number): number => {
  if (!values.length) return NaN;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const readLandmark = readPoseLandmark;

const getConfidence = (points: Array<LandmarkPoint | null>): number | null => {
  if (points.some((point) => point === null)) {
    return null;
  }
  const visibilityValues = points
    .map((point) => point?.visibility)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return average(visibilityValues);
};

const midpoint = (a: LandmarkPoint, b: LandmarkPoint): LandmarkPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: a.z !== null && b.z !== null ? (a.z + b.z) / 2 : null,
  visibility: average(
    [a.visibility, b.visibility].filter((value): value is number => typeof value === "number"),
  ),
});

const mapMetricValue = (
  value: number | null,
  points: Array<LandmarkPoint | null>,
  keepValueOnLowConfidence = false,
): MetricSample => {
  const confidence = getConfidence(points);
  if (value === null || !Number.isFinite(value)) {
    return {
      value: null,
      confidence,
      lowConfidence: false,
    };
  }

  if (confidence === null || confidence < POSE_CONFIDENCE_THRESHOLD) {
    return {
      value: keepValueOnLowConfidence ? value : null,
      confidence,
      lowConfidence: true,
    };
  }

  return {
    value,
    confidence,
    lowConfidence: false,
  };
};

const inferDominantSide = (frames: SlotPoseFrame[]): HandSide => {
  let leftExtensionTotal = 0;
  let rightExtensionTotal = 0;
  let leftCount = 0;
  let rightCount = 0;

  frames.forEach((frame) => {
    const leftShoulder = readLandmark(frame, POSE_INDEX.left_shoulder);
    const rightShoulder = readLandmark(frame, POSE_INDEX.right_shoulder);
    const leftWrist = readLandmark(frame, POSE_INDEX.left_wrist);
    const rightWrist = readLandmark(frame, POSE_INDEX.right_wrist);
    if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist) {
      return;
    }

    const shoulderWidth = distance2d(leftShoulder, rightShoulder);
    if (shoulderWidth <= Number.EPSILON) {
      return;
    }

    const leftConfidence = getConfidence([leftShoulder, leftWrist]);
    if (leftConfidence !== null && leftConfidence >= POSE_CONFIDENCE_THRESHOLD) {
      leftExtensionTotal += distance2d(leftWrist, leftShoulder) / shoulderWidth;
      leftCount += 1;
    }

    const rightConfidence = getConfidence([rightShoulder, rightWrist]);
    if (rightConfidence !== null && rightConfidence >= POSE_CONFIDENCE_THRESHOLD) {
      rightExtensionTotal += distance2d(rightWrist, rightShoulder) / shoulderWidth;
      rightCount += 1;
    }
  });

  const leftAvg = leftCount > 0 ? leftExtensionTotal / leftCount : 0;
  const rightAvg = rightCount > 0 ? rightExtensionTotal / rightCount : 0;
  return leftAvg >= rightAvg ? "left" : "right";
};

const computeFrameMetrics = (
  currentFrame: SlotPoseFrame,
  previousFrame: SlotPoseFrame | null,
  dominantSide: HandSide,
  poseFps: number,
): FrameMetricSample => {
  const metrics = createEmptyFrameMetricSample();

  const leftShoulder = readLandmark(currentFrame, POSE_INDEX.left_shoulder);
  const rightShoulder = readLandmark(currentFrame, POSE_INDEX.right_shoulder);
  const leftElbow = readLandmark(currentFrame, POSE_INDEX.left_elbow);
  const rightElbow = readLandmark(currentFrame, POSE_INDEX.right_elbow);
  const leftWrist = readLandmark(currentFrame, POSE_INDEX.left_wrist);
  const rightWrist = readLandmark(currentFrame, POSE_INDEX.right_wrist);
  const leftHip = readLandmark(currentFrame, POSE_INDEX.left_hip);
  const rightHip = readLandmark(currentFrame, POSE_INDEX.right_hip);
  const leftKnee = readLandmark(currentFrame, POSE_INDEX.left_knee);
  const rightKnee = readLandmark(currentFrame, POSE_INDEX.right_knee);
  const leftAnkle = readLandmark(currentFrame, POSE_INDEX.left_ankle);
  const rightAnkle = readLandmark(currentFrame, POSE_INDEX.right_ankle);

  const shoulderWidth =
    leftShoulder && rightShoulder ? distance2d(leftShoulder, rightShoulder) : null;
  const shoulderCenter =
    leftShoulder && rightShoulder ? midpoint(leftShoulder, rightShoulder) : null;
  const hipCenter = leftHip && rightHip ? midpoint(leftHip, rightHip) : null;

  const visibilityValues = currentFrame.landmarks
    .map((_, index) => readLandmark(currentFrame, index)?.visibility)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const trackingQuality = average(visibilityValues);
  metrics.trackingQuality = mapMetricValue(
    trackingQuality !== null ? trackingQuality * 100 : null,
    currentFrame.landmarks.map((_, index) => readLandmark(currentFrame, index)),
    true,
  );

  if (shoulderWidth !== null && shoulderWidth > Number.EPSILON) {
    const stanceWidth =
      leftAnkle && rightAnkle ? distance2d(leftAnkle, rightAnkle) / shoulderWidth : null;
    metrics.stanceWidthIndex = mapMetricValue(stanceWidth, [
      leftAnkle,
      rightAnkle,
      leftShoulder,
      rightShoulder,
    ]);
  }

  const weaponShoulder = dominantSide === "left" ? leftShoulder : rightShoulder;
  const weaponElbow = dominantSide === "left" ? leftElbow : rightElbow;
  const weaponWrist = dominantSide === "left" ? leftWrist : rightWrist;
  const leadHip = dominantSide === "left" ? leftHip : rightHip;
  const rearHip = dominantSide === "left" ? rightHip : leftHip;
  const leadKnee = dominantSide === "left" ? leftKnee : rightKnee;
  const rearKnee = dominantSide === "left" ? rightKnee : leftKnee;
  const leadAnkle = dominantSide === "left" ? leftAnkle : rightAnkle;
  const rearAnkle = dominantSide === "left" ? rightAnkle : leftAnkle;

  if (shoulderWidth !== null && shoulderWidth > Number.EPSILON) {
    const armExtension =
      weaponWrist && weaponShoulder
        ? distance2d(weaponWrist, weaponShoulder) / shoulderWidth
        : null;
    metrics.weaponArmExtension = mapMetricValue(armExtension, [weaponWrist, weaponShoulder]);

    const guardHeight =
      shoulderCenter && weaponWrist ? (shoulderCenter.y - weaponWrist.y) / shoulderWidth : null;
    metrics.guardHeight = mapMetricValue(guardHeight, [weaponWrist, leftShoulder, rightShoulder]);
  }

  if (poseFps > 0 && previousFrame && weaponWrist && shoulderWidth && shoulderWidth > Number.EPSILON) {
    const previousWeaponWrist = readLandmark(
      previousFrame,
      dominantSide === "left" ? POSE_INDEX.left_wrist : POSE_INDEX.right_wrist,
    );
    const frameDelta =
      currentFrame.frame_index > previousFrame.frame_index
        ? currentFrame.frame_index - previousFrame.frame_index
        : 1;
    const handSpeed =
      previousWeaponWrist
        ? (distance2d(weaponWrist, previousWeaponWrist) * poseFps) / (frameDelta * shoulderWidth)
        : null;
    metrics.handSpeed = mapMetricValue(handSpeed, [weaponWrist, previousWeaponWrist]);
  }

  const leadKneeAngle =
    leadHip && leadKnee && leadAnkle ? angleAtPointDegrees(leadHip, leadKnee, leadAnkle) : null;
  metrics.leadKneeAngle = mapMetricValue(leadKneeAngle, [leadHip, leadKnee, leadAnkle]);

  const rearKneeAngle =
    rearHip && rearKnee && rearAnkle ? angleAtPointDegrees(rearHip, rearKnee, rearAnkle) : null;
  metrics.rearKneeAngle = mapMetricValue(rearKneeAngle, [rearHip, rearKnee, rearAnkle]);

  const elbowAngle =
    weaponShoulder && weaponElbow && weaponWrist
      ? angleAtPointDegrees(weaponShoulder, weaponElbow, weaponWrist)
      : null;
  metrics.weaponArmElbowAngle = mapMetricValue(elbowAngle, [weaponShoulder, weaponElbow, weaponWrist]);

  const torsoLeanAngle = shoulderCenter && hipCenter
    ? Math.abs((Math.atan2(shoulderCenter.x - hipCenter.x, hipCenter.y - shoulderCenter.y) * 180) / Math.PI)
    : null;
  metrics.torsoLeanAngle = mapMetricValue(torsoLeanAngle, [leftShoulder, rightShoulder, leftHip, rightHip]);

  return metrics;
};

const formatMetricValue = (key: MetricKey, value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "N/A";
  if (key === "trackingQuality") return `${value.toFixed(0)}%`;
  if (key === "handSpeed") return `${value.toFixed(2)}x/s`;
  if (key === "leadKneeAngle" || key === "rearKneeAngle" || key === "weaponArmElbowAngle" || key === "torsoLeanAngle") {
    return `${value.toFixed(0)}deg`;
  }
  if (key === "guardHeight") {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}x`;
  }
  return `${value.toFixed(2)}x`;
};

const getMetricStatusLabel = (
  key: MetricKey,
  value: number | null,
  baseline: MetricBaseline | undefined,
): string => {
  if (value === null || !Number.isFinite(value)) return "N/A";
  const config = METRIC_CONFIG[key];
  if (!baseline || !Number.isFinite(baseline.p25) || !Number.isFinite(baseline.p75)) {
    return config.midLabel;
  }
  if (value <= baseline.p25) return config.lowLabel;
  if (value >= baseline.p75) return config.highLabel;
  return config.midLabel;
};

export default function VideoDetail() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { isZh } = useLocale();
  const t = useCallback(
    (zh: string, en: string) => (isZh ? zh : en),
    [isZh],
  );
  const videoId = params.video_id as string;

  const [video, setVideo] = useState<VideoMetadata | null>(null);
  const [poseData, setPoseData] = useState<PoseData | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportAction, setReportAction] = useState<"load" | "generate" | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [replayMode, setReplayMode] = useState<ReplayMode>("original");
  const [skeletonReady, setSkeletonReady] = useState(false);
  const [skeletonLoading, setSkeletonLoading] = useState(false);
  const [skeletonError, setSkeletonError] = useState<string | null>(null);
  const [playbackTimeSec, setPlaybackTimeSec] = useState(0);
  const [playbackFrameIndex, setPlaybackFrameIndex] = useState(0);
  const [selectedAthleteSlot, setSelectedAthleteSlot] = useState<AthleteSlot>("left");
  const [dominantSideMode, setDominantSideMode] = useState<DominantSideMode>("auto");
  const [isDominantHintOpen, setIsDominantHintOpen] = useState(false);
  const dominantHintRef = useRef<HTMLDivElement | null>(null);
  const detailFetchAbortRef = useRef<AbortController | null>(null);
  const detailFetchRequestIdRef = useRef(0);
  const skeletonFetchAbortRef = useRef<AbortController | null>(null);

  const availableAthleteSlots = useMemo(
    () => getAvailableAthleteSlots(poseData),
    [poseData],
  );
  const hasDualAthletes = useMemo(
    () => hasDualAthletePose(poseData),
    [poseData],
  );

  const fetchVideoData = useCallback(async () => {
    if (detailFetchAbortRef.current) {
      detailFetchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    detailFetchAbortRef.current = abortController;
    const requestId = detailFetchRequestIdRef.current + 1;
    detailFetchRequestIdRef.current = requestId;
    const isCurrentRequest = () =>
      requestId === detailFetchRequestIdRef.current && !abortController.signal.aborted;

    try {
      setLoading(true);
      setError(null);
      setReportError(null);
      setReport(readCachedAnalysisReport<AnalysisReport>(videoId));

      // Fetch core metadata + pose payload in parallel to reduce first-paint latency.
      const [videoResult, poseResult] = await Promise.allSettled([
        authFetch(`/video/${videoId}`, {
          signal: abortController.signal,
        }),
        authFetch(`/video/${videoId}/pose-data`, {
          signal: abortController.signal,
        }),
      ]);
      if (!isCurrentRequest()) {
        return;
      }

      if (videoResult.status === "rejected") {
        if (isAbortError(videoResult.reason)) {
          return;
        }
        throw new Error("Failed to fetch video");
      }

      const videoResponse = videoResult.value;
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch video");
      }
      const videoData = await videoResponse.json();
      if (!isCurrentRequest()) {
        return;
      }
      setVideo(videoData);

      let nextPoseData: PoseData | null = null;
      if (poseResult.status === "fulfilled") {
        const poseResponse = poseResult.value;
        if (poseResponse.ok) {
          nextPoseData = (await poseResponse.json()) as PoseData;
          if (!isCurrentRequest()) {
            return;
          }
          setPoseData(nextPoseData);
          setSelectedAthleteSlot(getDefaultAthleteSlot(nextPoseData));
        } else {
          setPoseData(null);
        }
      } else if (isAbortError(poseResult.reason)) {
        return;
      } else {
        setPoseData(null);
      }

      // Unblock page rendering as soon as core video + pose payload is ready.
      // Report can continue loading asynchronously in-panel.
      if (isCurrentRequest()) {
        setLoading(false);
      }

      try {
        if (nextPoseData) {
          if (!isCurrentRequest()) {
            return;
          }
          setReportLoading(true);
          setReportAction("load");
          const defaultSlot = getDefaultAthleteSlot(nextPoseData);
          const reportData = await ensureAnalysisReport<AnalysisReport>(videoId, {
            athleteSlot: defaultSlot,
            generateIfMissing: false,
          });
          if (!isCurrentRequest()) {
            return;
          }
          setReport(reportData);

          const hasActiveReportJob =
            (String(videoData.report_status || "").toLowerCase() === "pending") ||
            (String(videoData.report_status || "").toLowerCase() === "running");
          if (hasActiveReportJob || !reportData) {
            setReportAction(hasActiveReportJob ? "generate" : "load");
            const resumedReport = await resumeLatestAnalysisReportJob<AnalysisReport>(videoId, {
              athleteSlot: defaultSlot,
              pollIntervalMs: 1500,
              timeoutMs: 240000,
              signal: abortController.signal,
            });
            if (!isCurrentRequest()) {
              return;
            }
            setReport(resumedReport ?? reportData ?? null);
          }
        } else {
          setReport(null);
        }
      } catch (err) {
        if (isAbortError(err) || !isCurrentRequest()) {
          return;
        }
        setReport(null);
        setReportError(err instanceof Error ? err.message : "Failed to fetch report");
      } finally {
        if (isCurrentRequest()) {
          setReportLoading(false);
          setReportAction(null);
        }
      }

    } catch (err) {
      if (isAbortError(err) || !isCurrentRequest()) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load video");
    } finally {
      if (requestId === detailFetchRequestIdRef.current) {
        setLoading(false);
      }
      if (detailFetchAbortRef.current === abortController) {
        detailFetchAbortRef.current = null;
      }
    }
  }, [videoId]);

  useEffect(() => {
    if (videoId) {
      fetchVideoData();
    }
  }, [videoId, fetchVideoData]);

  useEffect(() => {
    return () => {
      if (detailFetchAbortRef.current) {
        detailFetchAbortRef.current.abort();
        detailFetchAbortRef.current = null;
      }
      if (skeletonFetchAbortRef.current) {
        skeletonFetchAbortRef.current.abort();
        skeletonFetchAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !videoId) {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.newValue === null) {
        return;
      }

      const cacheMeta = parseAnalysisReportCacheKey(event.key);
      if (!cacheMeta || cacheMeta.videoId !== videoId) {
        return;
      }
      if ((cacheMeta.athleteSlot ?? getDefaultAthleteSlot(poseData)) !== selectedAthleteSlot) {
        return;
      }

      try {
        setReport(JSON.parse(event.newValue) as AnalysisReport);
      } catch {
        // Ignore malformed cache payloads.
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [poseData, selectedAthleteSlot, videoId]);

  useEffect(() => {
    if (!poseData) {
      return;
    }

    const fallbackSlot = getDefaultAthleteSlot(poseData);
    if (availableAthleteSlots.length && !availableAthleteSlots.includes(selectedAthleteSlot)) {
      setSelectedAthleteSlot(fallbackSlot);
      return;
    }
    const hasActiveReportJob =
      (String(video?.report_status || "").toLowerCase() === "pending") ||
      (String(video?.report_status || "").toLowerCase() === "running");

    if (
      report &&
      report.video_id === videoId &&
      (report.athlete_slot ?? fallbackSlot) === selectedAthleteSlot &&
      !hasActiveReportJob
    ) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    const syncSlotReport = async () => {
      const cachedReport = readCachedAnalysisReport<AnalysisReport>(videoId, selectedAthleteSlot);
      const cachedSlot = cachedReport ? (cachedReport.athlete_slot ?? fallbackSlot) : null;
      if (cachedReport && cachedSlot === selectedAthleteSlot && !hasActiveReportJob) {
        setReport(cachedReport);
        setReportLoading(false);
        setReportAction(null);
        setReportError(null);
        return;
      }

      setReport(cachedReport);
      setReportLoading(true);
      setReportAction(hasActiveReportJob ? "generate" : "load");
      setReportError(null);
      try {
        const nextReport = await ensureAnalysisReport<AnalysisReport>(videoId, {
          athleteSlot: selectedAthleteSlot,
          generateIfMissing: false,
        });
        const resumedReport =
          hasActiveReportJob || !nextReport
            ? await resumeLatestAnalysisReportJob<AnalysisReport>(videoId, {
                athleteSlot: selectedAthleteSlot,
                pollIntervalMs: 1500,
                timeoutMs: 240000,
                signal: abortController.signal,
              })
            : null;
        if (!cancelled) {
          setReport(resumedReport ?? nextReport ?? cachedReport ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setReport(cachedReport ?? null);
          setReportError(err instanceof Error ? err.message : "Failed to fetch report");
        }
      } finally {
        if (!cancelled) {
          setReportLoading(false);
          setReportAction(null);
        }
      }
    };

    void syncSlotReport();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [availableAthleteSlots, poseData, report, selectedAthleteSlot, video, videoId]);

  useEffect(() => {
    const initialView = searchParams.get("view");
    if (initialView === "skeleton") {
      setReplayMode("skeleton");
    } else if (initialView === "replay") {
      setReplayMode("original");
    }
  }, [searchParams]);

  useEffect(() => {
    const handleGlobalDismiss = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dominantHintRef.current?.contains(target)) return;
      setIsDominantHintOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDominantHintOpen(false);
      }
    };

    document.addEventListener("mousedown", handleGlobalDismiss);
    document.addEventListener("touchstart", handleGlobalDismiss);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleGlobalDismiss);
      document.removeEventListener("touchstart", handleGlobalDismiss);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const ensureSkeletonReplay = useCallback(async () => {
    if (skeletonReady || skeletonLoading) {
      return;
    }

    if (skeletonFetchAbortRef.current) {
      skeletonFetchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    skeletonFetchAbortRef.current = abortController;

    try {
      setSkeletonLoading(true);
      setSkeletonError(null);
      const response = await authFetch(`/video/${videoId}/pose-overlay`, {
        signal: abortController.signal,
      });
      if (abortController.signal.aborted) {
        return;
      }
      if (response.status === 202) {
        const queued = (await response.json()) as PoseOverlayPrepareResponse;
        if (abortController.signal.aborted) {
          return;
        }
        if (!queued.job_id) {
          throw new Error(queued.message || "Pose overlay queued, but job id is missing");
        }

        await waitForPoseAnalysisJob(videoId, queued.job_id, {
          pollIntervalMs: 1500,
          timeoutMs: 900000,
        });
        if (abortController.signal.aborted) {
          return;
        }

        const readyResponse = await authFetch(`/video/${videoId}/pose-overlay`, {
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) {
          return;
        }
        if (!readyResponse.ok) {
          throw new Error("Pose overlay is still not ready");
        }
        const readyData = (await readyResponse.json()) as PoseOverlayPrepareResponse;
        if (abortController.signal.aborted) {
          return;
        }
        if (!readyData.overlay_video_path) {
          throw new Error(readyData.message || "Pose overlay is still not ready");
        }
        setSkeletonReady(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to prepare skeleton replay");
      }
      const data = (await response.json()) as PoseOverlayPrepareResponse;
      if (abortController.signal.aborted) {
        return;
      }
      if (!data.overlay_video_path) {
        throw new Error(data.message || "Pose overlay is still not ready");
      }
      setSkeletonReady(true);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setSkeletonError(err instanceof Error ? err.message : "Failed to prepare skeleton replay");
    } finally {
      if (skeletonFetchAbortRef.current === abortController) {
        setSkeletonLoading(false);
        skeletonFetchAbortRef.current = null;
      }
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
      setReportAction("generate");
      setReportError(null);
      const job = await startAnalysisReportJob(videoId, {
        athleteSlot: selectedAthleteSlot,
        forceRegenerate: Boolean(report),
      });
      const jobStatus = await waitForAnalysisReportJob<AnalysisReport>(
        videoId,
        job.job_id,
        { pollIntervalMs: 1500, timeoutMs: 240000 },
      );
      const data =
        jobStatus.results.find(
          (item) => (item.athlete_slot ?? selectedAthleteSlot) === selectedAthleteSlot,
        ) ?? jobStatus.results[0];
      if (!data) {
        throw new Error("Failed to generate report");
      }
      setReport(data);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setReportLoading(false);
      setReportAction(null);
    }
  };

  const getWeaponLabel = (weapon: string) => {
    const labels: Record<string, string> = {
      foil: isZh ? "花剑" : "Foil",
      epee: isZh ? "重剑" : "Epee",
      sabre: isZh ? "佩剑" : "Sabre",
    };
    return labels[weapon?.toLowerCase()] || weapon || (isZh ? "未知" : "Unknown");
  };

  const getWeaponColor = (weapon: string) => {
    const colors: Record<string, string> = {
      foil: "#FF6B35",
      epee: "#DC2626",
      sabre: "#06B6D4"
    };
    return colors[weapon?.toLowerCase()] || "#6B7280";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return isZh ? "未知" : "Unknown";
    const date = new Date(dateString);
    return date.toLocaleDateString(isZh ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const originalReplayUrl = buildAuthedApiUrl(`/video/${videoId}/file`);
  const skeletonReplayUrl = buildAuthedApiUrl(`/video/${videoId}/pose-overlay/file`);
  const poseFrames = useMemo(
    () => getSlotPoseFrames(poseData, selectedAthleteSlot),
    [poseData, selectedAthleteSlot],
  );
  const selectedAthleteLabel = useMemo(
    () => getAthleteSlotLabel(selectedAthleteSlot),
    [selectedAthleteSlot],
  );
  const poseFps = poseData?.video_properties?.fps || 0;
  const inferredDominantSide = useMemo(() => inferDominantSide(poseFrames), [poseFrames]);
  const activeDominantSide = dominantSideMode === "auto" ? inferredDominantSide : dominantSideMode;
  const localizedMetricConfig = useMemo<Record<MetricKey, MetricConfig>>(
    () =>
      isZh
        ? {
            trackingQuality: {
              label: "追踪质量",
              hint: "33 个关键点的平均可见性。",
              lowLabel: "低",
              midLabel: "稳定",
              highLabel: "高",
            },
            stanceWidthIndex: {
              label: "站姿宽度指数",
              hint: "踝间距/肩宽 的归一化结果。",
              lowLabel: "偏窄",
              midLabel: "均衡",
              highLabel: "偏宽",
            },
            weaponArmExtension: {
              label: "持剑手臂伸展",
              hint: "持剑侧腕到肩距离（归一化）。",
              lowLabel: "较短",
              midLabel: "准备",
              highLabel: "较长",
            },
            guardHeight: {
              label: "护手高度",
              hint: "持剑侧手部相对肩中线高度。",
              lowLabel: "低位",
              midLabel: "中位",
              highLabel: "高位",
            },
            handSpeed: {
              label: "手部速度",
              hint: "持剑侧手腕归一化速度（每秒）。",
              lowLabel: "慢",
              midLabel: "可控",
              highLabel: "快",
            },
            leadKneeAngle: {
              label: "前腿膝角",
              hint: "持剑侧髋-膝-踝夹角。",
              lowLabel: "深屈",
              midLabel: "蓄力",
              highLabel: "伸展",
            },
            rearKneeAngle: {
              label: "后腿膝角",
              hint: "后侧髋-膝-踝夹角。",
              lowLabel: "深屈",
              midLabel: "蓄力",
              highLabel: "伸展",
            },
            weaponArmElbowAngle: {
              label: "持剑臂肘角",
              hint: "持剑侧肩-肘-腕夹角。",
              lowLabel: "弯曲",
              midLabel: "蓄力",
              highLabel: "伸展",
            },
            torsoLeanAngle: {
              label: "躯干前倾角",
              hint: "肩髋连线相对竖直方向的倾角。",
              lowLabel: "较直立",
              midLabel: "中等前倾",
              highLabel: "较深前倾",
            },
          }
        : METRIC_CONFIG,
    [isZh],
  );
  const localizeMetricStatus = useCallback(
    (status: string) => {
      if (!isZh) return status;
      const map: Record<string, string> = {
        "N/A": "无数据",
        "Low confidence": "低置信度",
        Low: "低",
        Stable: "稳定",
        High: "高",
        Narrow: "偏窄",
        Balanced: "均衡",
        Wide: "偏宽",
        Short: "较短",
        Ready: "准备",
        Long: "较长",
        "Low Guard": "低位",
        Neutral: "中位",
        "High Guard": "高位",
        Slow: "慢",
        Controlled: "可控",
        Fast: "快",
        "Deep Bend": "深屈",
        Loaded: "蓄力",
        Extended: "伸展",
        Bent: "弯曲",
        Upright: "较直立",
        "Neutral Lean": "中等前倾",
        "Deep Lean": "较深前倾",
      };
      return map[status] || status;
    },
    [isZh],
  );

  const currentPoseMatch = useMemo(() => {
    if (!poseFrames.length) {
      return null;
    }

    let left = 0;
    let right = poseFrames.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midFrameIndex = poseFrames[mid]?.frame_index ?? 0;

      if (midFrameIndex === playbackFrameIndex) {
        return { frame: poseFrames[mid], index: mid };
      }

      if (midFrameIndex < playbackFrameIndex) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    const nextIndex = Math.min(left, poseFrames.length - 1);
    const prevIndex = Math.max(0, nextIndex - 1);
    const nextFrame = poseFrames[nextIndex];
    const prevFrame = poseFrames[prevIndex];

    return Math.abs((nextFrame?.frame_index ?? 0) - playbackFrameIndex) <
      Math.abs((prevFrame?.frame_index ?? 0) - playbackFrameIndex)
      ? { frame: nextFrame, index: nextIndex }
      : { frame: prevFrame, index: prevIndex };
  }, [playbackFrameIndex, poseFrames]);

  const currentPoseFrame = currentPoseMatch?.frame ?? null;
  const currentPoseFrameArrayIndex = currentPoseMatch?.index ?? -1;

  const metricTimeline = useMemo<FrameMetricSample[]>(() => {
    if (!poseFrames.length) return [];

    const rawTimeline = poseFrames.map((frame, index) =>
      computeFrameMetrics(frame, index > 0 ? poseFrames[index - 1] : null, activeDominantSide, poseFps),
    );

    const emaTracker = {} as Partial<Record<MetricKey, number | null>>;
    METRIC_KEYS.forEach((key) => {
      emaTracker[key] = null;
    });

    return rawTimeline.map((sample) => {
      const smoothedSample = createEmptyFrameMetricSample();

      METRIC_KEYS.forEach((key) => {
        const metric = sample[key];
        if (typeof metric.value === "number" && Number.isFinite(metric.value)) {
          const previousEma = emaTracker[key];
          const nextEma =
            typeof previousEma === "number"
              ? METRIC_EMA_ALPHA * metric.value + (1 - METRIC_EMA_ALPHA) * previousEma
              : metric.value;
          emaTracker[key] = nextEma;
          smoothedSample[key] = {
            ...metric,
            value: nextEma,
          };
        } else {
          smoothedSample[key] = metric;
        }
      });

      return smoothedSample;
    });
  }, [activeDominantSide, poseFps, poseFrames]);

  const metricBaselines = useMemo<MetricBaselines>(() => {
    const baselines: MetricBaselines = {};

    METRIC_KEYS.forEach((key) => {
      const values = metricTimeline
        .map((sample) => sample[key].value)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      if (!values.length) return;

      baselines[key] = {
        p25: quantile(values, 0.25),
        p75: quantile(values, 0.75),
      };
    });

    return baselines;
  }, [metricTimeline]);

  const currentMetricCards = useMemo(() => {
    if (currentPoseFrameArrayIndex < 0 || currentPoseFrameArrayIndex >= metricTimeline.length) {
      return METRIC_KEYS.map((key) => ({
        key,
        ...localizedMetricConfig[key],
        value: null as number | null,
        formattedValue: isZh ? "无数据" : "N/A",
        status: isZh ? "无数据" : "N/A",
        lowConfidence: false,
      }));
    }

    const sample = metricTimeline[currentPoseFrameArrayIndex];
    return METRIC_KEYS.map((key) => {
      const metric = sample[key];
      const formattedValue = formatMetricValue(key, metric.value);
      const status = metric.lowConfidence
        ? localizeMetricStatus("Low confidence")
        : getMetricStatusLabel(key, metric.value, metricBaselines[key]);

      return {
        key,
        ...localizedMetricConfig[key],
        value: metric.value,
        formattedValue,
        status: localizeMetricStatus(status),
        lowConfidence: metric.lowConfidence,
      };
    });
  }, [currentPoseFrameArrayIndex, isZh, localizeMetricStatus, localizedMetricConfig, metricBaselines, metricTimeline]);

  const currentConfidence = useMemo(() => {
    if (!currentPoseFrame) return null;
    const values = currentPoseFrame.landmarks
      .map((_, index) => readLandmark(currentPoseFrame, index)?.visibility)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return average(values);
  }, [currentPoseFrame]);

  const syncPoseFrameWithPlayback = useCallback((currentTime: number) => {
    if (!poseFps) {
      setPlaybackTimeSec(currentTime);
      return;
    }
    setPlaybackTimeSec(currentTime);
    setPlaybackFrameIndex(Math.max(0, Math.round(currentTime * poseFps)));
  }, [poseFps]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm">{t("加载视频中...", "Loading video...")}</p>
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
              <p className="text-red-500 text-sm">{error || t("未找到视频", "Video not found")}</p>
              <Link href="/history" className="mt-2 text-sm text-primary hover:underline inline-block">
                {t("返回历史页", "Back to History")}
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
            {t("返回历史页", "Back to History")}
          </Link>

          {/* Video Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">{video.title || t("未命名视频", "Untitled Video")}</h1>
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
                  {video.match_result === "win"
                    ? t("胜", "Win")
                    : video.match_result === "loss"
                      ? t("负", "Loss")
                      : t("平", "Draw")}
                </span>
              )}
            </div>

            {/* Match Info */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("运动员", "Athlete")}</p>
                  <p className="font-medium">{video.athlete || t("未知", "Unknown")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("对手", "Opponent")}</p>
                  <p className="font-medium">{video.opponent || t("未知", "Unknown")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("比分", "Score")}</p>
                  <p className="font-medium">{video.score || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("上传时间", "Uploaded")}</p>
                  <p className="font-medium">{formatDate(video.upload_time)}</p>
                </div>
              </div>
            </div>
          </div>

          <div id="replay" className="mb-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold">{t("回放", "Replay")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("可查看原始视频，或切换到骨架叠加回放。", "Review the original clip or switch to the skeleton overlay replay.")}
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setReplayMode("original")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    replayMode === "original" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("原始", "Original")}
                </button>
                <button
                  type="button"
                  onClick={() => setReplayMode("skeleton")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    replayMode === "skeleton" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("骨架", "Skeleton")}
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="aspect-video bg-black">
                {replayMode === "skeleton" && skeletonLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                      <p className="text-sm text-muted-foreground">{t("准备骨架回放中...", "Preparing skeleton replay...")}</p>
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
                      {t("重试骨架回放", "Retry Skeleton Replay")}
                    </button>
                  </div>
                ) : (
                  <video
                    key={replayMode}
                    controls
                    playsInline
                    preload="none"
                    className="h-full w-full"
                    src={replayMode === "skeleton" ? skeletonReplayUrl : originalReplayUrl}
                    onLoadedMetadata={(event) => syncPoseFrameWithPlayback(event.currentTarget.currentTime || 0)}
                    onTimeUpdate={(event) => syncPoseFrameWithPlayback(event.currentTarget.currentTime || 0)}
                    onSeeked={(event) => syncPoseFrameWithPlayback(event.currentTarget.currentTime || 0)}
                  />
                )}
              </div>
            </div>

            {poseData ? (
              <div className="mt-4 flex justify-center">
                <div className="w-full max-w-2xl rounded-2xl border border-border bg-card/85 px-4 py-4 shadow-sm">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        {t("回放焦点", "Replay Focus")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {hasDualAthletes
                          ? t("选择由哪位运动员驱动下方实时数据和 AI 报告。", "Choose which athlete drives the live data and AI report below.")
                          : t("实时数据和 AI 报告将跟随检测到的运动员。", "Live data and AI report follow the detected athlete.")}
                      </p>
                    </div>

                    {hasDualAthletes ? (
                      <div className="inline-flex rounded-xl border border-border bg-background p-1 shadow-sm">
                        {availableAthleteSlots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setSelectedAthleteSlot(slot)}
                            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                              selectedAthleteSlot === slot
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {getAthleteSlotLabel(slot)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground">
                        {selectedAthleteLabel}
                      </div>
                    )}

                    <p className="text-sm font-medium text-foreground">
                      {t("当前焦点：", "Current focus: ")}
                      <span className="text-primary">{selectedAthleteLabel}</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Pose Analysis */}
          {poseData && (
            <div className="mb-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold">{t("姿态分析", "Pose Analysis")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("下方实时数据跟随当前回放焦点：", "Live data below follows the replay focus: ")}
                    {selectedAthleteLabel}.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{t("AI 分析数据仅供参考。", "AI analysis is for reference only.")}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-6">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("播放时间", "Playback Time")}</p>
                    <p className="text-2xl font-bold">{playbackTimeSec.toFixed(2)}s</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("估算帧", "Estimated Frame")}</p>
                    <p className="text-2xl font-bold">{playbackFrameIndex}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("匹配姿态帧", "Matched Pose Frame")}</p>
                    <p className="text-2xl font-bold">{currentPoseFrame?.frame_index ?? "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("检测置信度", "Detection Confidence")}</p>
                    <p className="text-2xl font-bold">
                      {currentConfidence !== null ? `${(currentConfidence * 100).toFixed(0)}%` : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("姿态 FPS", "Pose FPS")}</p>
                    <p className="text-2xl font-bold">{poseData.video_properties?.fps || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("已选运动员", "Selected Athlete")}</p>
                    <p className="text-2xl font-bold">{getAthleteSlotShortLabel(selectedAthleteSlot)}</p>
                    <p className="text-xs text-muted-foreground">
                      {hasDualAthletes
                        ? t("由回放焦点选择器控制", "Controlled from the replay focus selector")
                        : t("仅检测到单个运动员", "Single detected athlete")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("惯用手侧", "Weapon Side")}</p>
                    <p className="text-2xl font-bold">{activeDominantSide === "left" ? t("左手", "Left") : t("右手", "Right")}</p>
                    <p className="text-xs text-muted-foreground">
                      {dominantSideMode === "auto" ? t("自动识别", "Auto detected") : t("手动覆盖", "Manual override")}
                    </p>
                  </div>
                </div>

                <div className="mb-4 rounded-xl border border-border bg-background/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {t("实时指标按肩宽归一化，并使用 3 帧 EMA 平滑。", "Live metrics are normalized by shoulder width and smoothed with a 3-frame EMA.")}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-lg border border-border bg-card p-1">
                        {(["auto", "left", "right"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setDominantSideMode(mode)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              dominantSideMode === mode
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {mode === "auto" ? t("自动", "Auto") : mode === "left" ? t("左手", "Left") : t("右手", "Right")}
                          </button>
                        ))}
                      </div>

                      <div
                        ref={dominantHintRef}
                        className="relative"
                        onMouseEnter={() => setIsDominantHintOpen(true)}
                        onMouseLeave={() => setIsDominantHintOpen(false)}
                      >
                        <button
                          type="button"
                          aria-label={t("显示惯用手选择说明", "Show dominant hand selector help")}
                          aria-haspopup="true"
                          aria-expanded={isDominantHintOpen}
                          aria-describedby={isDominantHintOpen ? "dominant-hand-tooltip" : undefined}
                          onClick={() => setIsDominantHintOpen((open) => !open)}
                          onFocus={() => setIsDominantHintOpen(true)}
                          onBlur={(event) => {
                            const nextTarget = event.relatedTarget;
                            if (!(nextTarget instanceof Node) || !dominantHintRef.current?.contains(nextTarget)) {
                              setIsDominantHintOpen(false);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setIsDominantHintOpen(false);
                            }
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 text-xs font-semibold text-muted-foreground/80 transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          ?
                        </button>
                        {isDominantHintOpen ? (
                          <div
                            id="dominant-hand-tooltip"
                            role="tooltip"
                            className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-lg"
                          >
                            {t(
                              "惯用手选择器：该选项会影响武器侧指标（lead/rear 对应关系）。",
                              "Dominant hand selector: this controls weapon-side metrics (lead/rear mapping).",
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {!currentPoseFrame ? (
                  <div className="rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
                    {t("当前播放时间尚未匹配到姿态帧。", "No pose frame matched the current playback time yet.")}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {currentMetricCards.map((metric) => (
                      <article key={metric.key} className="rounded-lg border border-border bg-background px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium">{metric.label}</p>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              metric.lowConfidence
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                : "border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {metric.status}
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">{metric.formattedValue}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
                        {metric.lowConfidence ? (
                          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                            {t("当前帧置信度较低。", "Low confidence in this frame.")}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Analysis Report */}
          <div className="mb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{t("AI 分析报告", "AI Analysis Report")}</h2>
                {poseData ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("报告对象跟随回放焦点：", "Report target follows the replay focus: ")}
                    {selectedAthleteLabel}
                    {t("。切换运动员只会加载对应已保存报告。", ". Switching athlete only loads that athlete's saved report.")}
                  </p>
                ) : null}
              </div>
              {poseData ? (
                <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                  {t("已与回放焦点同步", "Synced with replay focus")}
                </span>
              ) : null}
            </div>

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
                      {report.cached ? t("缓存报告", "Cached report") : t("已保存报告", "Saved report")}
                    </span>
                    <span>
                      {t("更新于 ", "Updated ")}
                      {new Date(report.updated_at).toLocaleString(isZh ? "zh-CN" : "en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {reportLoading && reportAction === "load" && <span>{t("正在加载已保存报告...", "Loading saved report...")}</span>}
                    {reportLoading && reportAction === "generate" && <span>{t("正在更新报告...", "Updating report...")}</span>}
                  </div>
                </div>
                <ReportMarkdown content={report.report} summary={report.summary} />
                {poseData ? (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">
                      {t("需要为以下对象重新分析吗：", "Need a fresh pass for ")}
                      {selectedAthleteLabel}
                      {t("？可在此生成新的已保存报告。", "? Generate a new saved report here.")}
                    </p>
                    <button
                      onClick={generateReport}
                      disabled={reportLoading}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reportLoading && reportAction === "generate"
                        ? t("重新生成中...", "Regenerating...")
                        : isZh
                          ? `重新生成 ${getAthleteSlotShortLabel(selectedAthleteSlot)} 报告`
                          : `Regenerate ${getAthleteSlotShortLabel(selectedAthleteSlot)} Report`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : poseData ? (
              <div className="p-4 rounded-xl bg-card border border-border">
                {reportLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-muted-foreground text-sm">
                        {reportAction === "generate"
                          ? t("正在生成 AI 报告...", "Generating AI report...")
                          : t("正在加载已保存报告...", "Loading saved report...")}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground mb-4">
                      {t("未找到以下对象的已保存报告：", "No saved report found for ")}
                      {selectedAthleteLabel}
                      {t("。如需保存该对象的专属报告，可立即生成。", ". Generate one when you want to save a dedicated report for this athlete.")}
                    </p>
                    <button
                      onClick={generateReport}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      {isZh
                        ? `生成 ${getAthleteSlotShortLabel(selectedAthleteSlot)} 报告`
                        : `Generate ${getAthleteSlotShortLabel(selectedAthleteSlot)} Report`}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <p className="text-muted-foreground text-sm">
                  {t("暂无姿态数据。请先运行姿态分析后再生成 AI 报告。", "No pose data available. Run pose analysis first to generate an AI report.")}
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
              <h3 className="text-lg font-semibold mb-2">{t("暂无分析数据", "No Analysis Data")}</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {t("该视频尚未完成分析，请前往 Analyze 运行姿态检测。", "This video has not been analyzed yet. Go to Analyze to run pose detection.")}
              </p>
              <Link
                href={`/analyze?video=${videoId}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t("运行分析", "Run Analysis")}
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

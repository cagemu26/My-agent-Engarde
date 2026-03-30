export type AthleteSlot = "left" | "right";

export interface PoseLandmarkObject {
  name?: string;
  x?: number;
  y?: number;
  z?: number;
  visibility?: number;
}

export type PoseLandmark = number[] | PoseLandmarkObject;

export interface PoseAthlete {
  slot: AthleteSlot;
  track_id: string;
  landmarks: PoseLandmark[];
  visibility?: number[];
  confidence?: number | null;
  center_x?: number | null;
  center_y?: number | null;
  present?: boolean;
}

export interface PoseFrame {
  frame_index: number;
  timestamp?: number;
  athletes?: PoseAthlete[];
  landmarks?: PoseLandmark[];
  visibility?: number[];
}

export interface PosePlayerSummary {
  slot: AthleteSlot;
  track_id: string;
  coverage_frames: number;
  coverage_ratio: number;
  average_confidence: number;
  display_name?: string | null;
}

export interface PoseData {
  schema_version?: number;
  detector_info?: {
    provider?: string;
    model?: string;
    num_poses?: number;
    model_asset?: string | null;
  };
  players?: PosePlayerSummary[];
  pose_sequence: PoseFrame[];
  video_properties: {
    width: number;
    height: number;
    fps: number;
    frame_count: number;
    duration?: number;
  };
  processing?: {
    sample_interval?: number;
    processed_frames?: number;
    total_frames?: number;
    selected_athlete_slot?: AthleteSlot;
  };
}

export interface SlotPoseFrame {
  frame_index: number;
  timestamp?: number;
  slot: AthleteSlot;
  track_id?: string | null;
  landmarks: PoseLandmark[];
  visibility?: number[];
  confidence?: number | null;
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number | null;
  visibility: number | null;
}

export function isAthleteSlot(value: unknown): value is AthleteSlot {
  return value === "left" || value === "right";
}

export function getAthleteSlotLabel(slot: AthleteSlot): string {
  return slot === "right" ? "Right Athlete" : "Left Athlete";
}

export function getAthleteSlotShortLabel(slot: AthleteSlot): string {
  return slot === "right" ? "Right" : "Left";
}

export function getAvailableAthleteSlots(poseData: PoseData | null | undefined): AthleteSlot[] {
  if (!poseData) return [];

  const playerSlots = (poseData.players ?? [])
    .map((player) => player.slot)
    .filter(isAthleteSlot);
  if (playerSlots.length) {
    return Array.from(new Set(playerSlots));
  }

  const discovered: AthleteSlot[] = [];
  for (const frame of poseData.pose_sequence ?? []) {
    for (const athlete of frame.athletes ?? []) {
      if (isAthleteSlot(athlete.slot) && !discovered.includes(athlete.slot)) {
        discovered.push(athlete.slot);
      }
    }
  }
  return discovered;
}

export function hasDualAthletePose(poseData: PoseData | null | undefined): boolean {
  return getAvailableAthleteSlots(poseData).length >= 2;
}

export function getDefaultAthleteSlot(poseData: PoseData | null | undefined): AthleteSlot {
  const availableSlots = getAvailableAthleteSlots(poseData);
  if (availableSlots.includes("left")) return "left";
  if (availableSlots.includes("right")) return "right";
  return "left";
}

export function getFrameAthlete(
  frame: PoseFrame | null | undefined,
  slot: AthleteSlot,
): PoseAthlete | null {
  if (!frame) return null;

  const matchedAthlete = (frame.athletes ?? []).find((athlete) => athlete.slot === slot);
  if (matchedAthlete) {
    return matchedAthlete;
  }

  if (slot !== "left" || !Array.isArray(frame.landmarks)) {
    return null;
  }

  return {
    slot: "left",
    track_id: "left",
    landmarks: frame.landmarks,
    visibility: frame.visibility,
    confidence: null,
    present: frame.landmarks.length > 0,
  };
}

export function getSlotPoseFrames(
  poseData: PoseData | null | undefined,
  slot: AthleteSlot,
): SlotPoseFrame[] {
  if (!poseData?.pose_sequence?.length) {
    return [];
  }

  const frames = poseData.pose_sequence
    .map((frame): SlotPoseFrame | null => {
      const athlete = getFrameAthlete(frame, slot);
      if (!athlete?.landmarks?.length) {
        return null;
      }
      return {
        frame_index: frame.frame_index,
        timestamp: frame.timestamp,
        slot,
        track_id: athlete.track_id,
        landmarks: athlete.landmarks,
        visibility: athlete.visibility,
        confidence: athlete.confidence,
      };
    })
    .filter((frame): frame is SlotPoseFrame => frame !== null);

  return frames;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readPoseLandmark(
  frame: Pick<SlotPoseFrame, "landmarks" | "visibility"> | null | undefined,
  index: number,
): LandmarkPoint | null {
  if (!frame || !Array.isArray(frame.landmarks)) {
    return null;
  }

  const raw = frame.landmarks[index];
  if (!raw) return null;

  const fallbackVisibility = Array.isArray(frame.visibility)
    ? toFiniteNumber(frame.visibility[index])
    : null;

  if (Array.isArray(raw)) {
    const x = toFiniteNumber(raw[0]);
    const y = toFiniteNumber(raw[1]);
    if (x === null || y === null) return null;
    return {
      x,
      y,
      z: toFiniteNumber(raw[2]),
      visibility: toFiniteNumber(raw[3]) ?? fallbackVisibility,
    };
  }

  if (typeof raw === "object") {
    const point = raw as PoseLandmarkObject;
    const x = toFiniteNumber(point.x);
    const y = toFiniteNumber(point.y);
    if (x === null || y === null) return null;
    return {
      x,
      y,
      z: toFiniteNumber(point.z),
      visibility: toFiniteNumber(point.visibility) ?? fallbackVisibility,
    };
  }

  return null;
}

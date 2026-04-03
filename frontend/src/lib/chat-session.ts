export const SESSION_TYPE_VIDEO = "video_analysis" as const;
export const SESSION_TYPE_TRAINING = "training_analysis" as const;
export const SESSION_TYPE_CHAT = "chat_qa" as const;

export type SessionType =
  | typeof SESSION_TYPE_VIDEO
  | typeof SESSION_TYPE_TRAINING
  | typeof SESSION_TYPE_CHAT;

export const SESSION_META: Record<
  SessionType,
  { label: string; badgeClass: string; dotClass: string }
> = {
  [SESSION_TYPE_VIDEO]: {
    label: "Video Analysis",
    badgeClass:
      "border border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/30 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  [SESSION_TYPE_TRAINING]: {
    label: "Training Analysis",
    badgeClass:
      "border border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800/50 dark:bg-orange-900/30 dark:text-orange-300",
    dotClass: "bg-orange-500",
  },
  [SESSION_TYPE_CHAT]: {
    label: "Chat Q&A",
    badgeClass:
      "border border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
};

export const normalizeSessionType = (value?: string | null): SessionType => {
  if (value === SESSION_TYPE_VIDEO || value === SESSION_TYPE_TRAINING) {
    return value;
  }
  return SESSION_TYPE_CHAT;
};

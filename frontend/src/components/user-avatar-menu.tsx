"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent } from "react";
import type { AuthUser } from "@/lib/auth";

export interface UserAvatarMenuProps {
  user: Pick<AuthUser, "username" | "email">;
  onLogout: () => void;
  profileHref?: string;
  historyHref?: string;
  compact?: boolean;
  align?: "left" | "right";
  onProfileClick?: () => void;
  onHistoryClick?: () => void;
}

type MenuOpenReason = "hover" | "click" | null;

const HOVER_OPEN_DELAY_MS = 90;
const HOVER_CLOSE_DELAY_MS = 180;

function getInitials(username: string, email: string): string {
  const source = username.trim() || email.trim();
  if (!source) {
    return "?";
  }

  const words = source
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) {
    return source.slice(0, 2).toUpperCase();
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function UserAvatarMenu({
  user,
  onLogout,
  profileHref = "/profile",
  historyHref = "/history",
  compact = false,
  align = "right",
  onProfileClick,
  onHistoryClick,
}: UserAvatarMenuProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const menuId = useId();

  const [supportsHover, setSupportsHover] = useState(false);
  const [openReason, setOpenReason] = useState<MenuOpenReason>(null);

  const isOpen = openReason !== null;
  const initials = useMemo(() => getInitials(user.username ?? "", user.email ?? ""), [user.email, user.username]);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const closeMenu = useCallback(() => {
    clearHoverTimer();
    setOpenReason(null);
  }, [clearHoverTimer]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncHoverCapability = () => setSupportsHover(mediaQuery.matches);

    syncHoverCapability();
    mediaQuery.addEventListener("change", syncHoverCapability);

    return () => {
      mediaQuery.removeEventListener("change", syncHoverCapability);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearHoverTimer();
    };
  }, [clearHoverTimer]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeMenu, isOpen]);

  const handleMouseEnter = () => {
    if (!supportsHover) {
      return;
    }

    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      setOpenReason((prev) => (prev === "click" ? prev : "hover"));
    }, HOVER_OPEN_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (!supportsHover) {
      return;
    }

    if (openReason === "click") {
      return;
    }

    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      setOpenReason((prev) => (prev === "hover" ? null : prev));
    }, HOVER_CLOSE_DELAY_MS);
  };

  const handleButtonClick = () => {
    setOpenReason((prev) => {
      if (supportsHover) {
        return prev === "click" ? null : "click";
      }
      return prev ? null : "click";
    });
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    closeMenu();
  };

  const avatarSizeClass = compact ? "h-9 w-9 text-xs" : "h-10 w-10 text-sm";
  const menuAlignClass = align === "left" ? "left-0" : "right-0";

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={handleButtonClick}
        className={`inline-flex items-center justify-center rounded-full border border-border bg-card font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 ${avatarSizeClass}`}
      >
        {initials}
      </button>

      {isOpen ? (
        <div className={`absolute ${menuAlignClass} top-full z-[60] pt-2`}>
          <div
            id={menuId}
            role="menu"
            className="w-44 rounded-xl border border-border/80 bg-background p-1.5 shadow-xl"
          >
            <Link
              href={profileHref}
              role="menuitem"
              onClick={() => {
                closeMenu();
                onProfileClick?.();
              }}
              className="block rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            >
              个人资料
            </Link>
            <Link
              href={historyHref}
              role="menuitem"
              onClick={() => {
                closeMenu();
                onHistoryClick?.();
              }}
              className="mt-1 block rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            >
              个人历史
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onLogout();
              }}
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            >
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

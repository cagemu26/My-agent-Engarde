"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { authFetch } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";

const PROFILE_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/history", label: "History" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

const formatCreatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

const getInitials = (username: string, email: string) => {
  const source = username.trim() || email.trim();
  if (!source) {
    return "?";
  }

  const words = source.split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) {
    return source.slice(0, 2).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [profile, setProfile] = useState<AuthUser | null>(user);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    setProfile(user);
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    const refreshProfile = async () => {
      try {
        const response = await authFetch("/api/auth/me");
        if (!response.ok) {
          throw new Error("Failed to refresh profile information.");
        }
        const data = (await response.json()) as AuthUser;
        if (cancelled) {
          return;
        }
        setProfile(data);
        window.localStorage.setItem("auth_user", JSON.stringify(data));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRefreshError(error instanceof Error ? error.message : "Failed to refresh profile information.");
      }
    };

    refreshProfile();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const currentUser = profile ?? user;
  const avatarInitials = useMemo(() => {
    if (!currentUser) {
      return "?";
    }
    return getInitials(currentUser.username, currentUser.email);
  }, [currentUser]);

  if (isLoading || (user && !currentUser)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-red-600" />
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav links={[...PROFILE_NAV_LINKS]} />
      <main className="mx-auto max-w-4xl px-6 pb-20 pt-32">
        <section className="rounded-3xl border border-border/70 bg-card p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted text-lg font-semibold text-foreground">
                {avatarInitials}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">个人资料</h1>
                <p className="text-sm font-medium text-foreground">{currentUser.username}</p>
                <p className="text-sm text-muted-foreground">Read-only account details from your current session.</p>
              </div>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                currentUser.is_admin ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-700"
              }`}
            >
              {currentUser.is_admin ? "Admin" : "User"}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Username</dt>
              <dd className="mt-2 text-base font-medium text-foreground">{currentUser.username}</dd>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd className="mt-2 text-base font-medium text-foreground break-all">{currentUser.email}</dd>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Verified</dt>
              <dd className="mt-2 text-base font-medium text-foreground">{currentUser.email_verified ? "Yes" : "No"}</dd>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</dt>
              <dd className="mt-2 text-base font-medium text-foreground">{currentUser.is_admin ? "Admin" : "User"}</dd>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created At</dt>
              <dd className="mt-2 text-base font-medium text-foreground">{formatCreatedAt(currentUser.created_at)}</dd>
            </div>
          </dl>

          {refreshError ? (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{refreshError}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/reset-password"
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Reset password
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              Logout
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

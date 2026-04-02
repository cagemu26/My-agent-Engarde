"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api";
import { TopNav } from "@/components/top-nav";

const ADMIN_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/history", label: "History" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

interface Feedback {
  id: string;
  user_email: string | null;
  category: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function FeedbackAdminPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const feedbacksFetchAbortRef = useRef<AbortController | null>(null);
  const feedbacksFetchRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isLoading && (!user || !user.is_admin)) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const fetchFeedbacks = useCallback(async () => {
    if (!token) return;
    if (feedbacksFetchAbortRef.current) {
      feedbacksFetchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    feedbacksFetchAbortRef.current = abortController;
    const requestId = feedbacksFetchRequestIdRef.current + 1;
    feedbacksFetchRequestIdRef.current = requestId;

    try {
      const url =
        filter === "all"
          ? buildApiUrl("/api/feedback")
          : buildApiUrl(`/api/feedback?status_filter=${filter}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: abortController.signal,
      });
      if (abortController.signal.aborted || requestId !== feedbacksFetchRequestIdRef.current) {
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch feedbacks");
      }
      const data = await response.json();
      if (abortController.signal.aborted || requestId !== feedbacksFetchRequestIdRef.current) {
        return;
      }
      setFeedbacks(data);
      setError("");
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError") ||
        requestId !== feedbacksFetchRequestIdRef.current
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      if (requestId === feedbacksFetchRequestIdRef.current) {
        setLoading(false);
      }
      if (feedbacksFetchAbortRef.current === abortController) {
        feedbacksFetchAbortRef.current = null;
      }
    }
  }, [filter, token]);

  useEffect(() => {
    if (user && user.is_admin && token) {
      fetchFeedbacks();
    }
  }, [user, token, fetchFeedbacks]);

  useEffect(() => {
    return () => {
      if (feedbacksFetchAbortRef.current) {
        feedbacksFetchAbortRef.current.abort();
        feedbacksFetchAbortRef.current = null;
      }
    };
  }, []);

  const updateStatus = async (feedbackId: string, status: string) => {
    try {
      const response = await fetch(buildApiUrl(`/api/feedback/${feedbackId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error("Failed to update feedback");
      }
      await fetchFeedbacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const deleteFeedback = async (feedbackId: string) => {
    if (!confirm("Are you sure you want to delete this feedback?")) return;

    try {
      const response = await fetch(buildApiUrl(`/api/feedback/${feedbackId}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to delete feedback");
      }
      await fetchFeedbacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      bug: "Bug Report",
      feature: "Feature Request",
      general: "General",
    };
    return labels[category] || category;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      bug: "bg-red-100 text-red-700",
      feature: "bg-blue-100 text-blue-700",
      general: "bg-gray-100 text-gray-700",
    };
    return colors[category] || "bg-gray-100 text-gray-700";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700",
      reviewed: "bg-blue-100 text-blue-700",
      resolved: "bg-green-100 text-green-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!user || !user.is_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }}></div>
        <div className="absolute inset-0 section-grid opacity-30"></div>
      </div>

      <TopNav activeHref="/admin" links={[...ADMIN_NAV_LINKS]} />

      {/* Main Content */}
      <main className="pt-32 pb-20 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">User Feedback</h1>
              <p className="text-muted-foreground">Manage user feedback and suggestions</p>
            </div>
            <Link
              href="/admin"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Back to Admin
            </Link>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-6">
            {["all", "pending", "reviewed", "resolved"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  filter === status
                    ? "bg-red-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Feedback List */}
          <div className="space-y-4">
            {feedbacks.map((feedback) => (
              <div key={feedback.id} className="glass-card rounded-3xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(feedback.category)}`}>
                        {getCategoryLabel(feedback.category)}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(feedback.status)}`}>
                        {feedback.status}
                      </span>
                      {feedback.user_email && (
                        <span className="text-sm text-muted-foreground">
                          {feedback.user_email}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{feedback.title}</h3>
                    <p className="text-muted-foreground mb-3">{feedback.content}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(feedback.created_at)}</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {feedback.status === "pending" && (
                      <button
                        onClick={() => updateStatus(feedback.id, "reviewed")}
                        className="px-4 py-2 rounded-xl bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 transition-all"
                      >
                        Mark Reviewed
                      </button>
                    )}
                    {feedback.status === "reviewed" && (
                      <button
                        onClick={() => updateStatus(feedback.id, "resolved")}
                        className="px-4 py-2 rounded-xl bg-green-100 text-green-700 text-sm font-medium hover:bg-green-200 transition-all"
                      >
                        Mark Resolved
                      </button>
                    )}
                    <button
                      onClick={() => deleteFeedback(feedback.id)}
                      className="px-4 py-2 rounded-xl bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {feedbacks.length === 0 && (
              <div className="glass-card rounded-3xl p-12 text-center">
                <p className="text-muted-foreground">No feedback found</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

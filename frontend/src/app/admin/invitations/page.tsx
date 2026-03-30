"use client";

import { useCallback, useEffect, useState } from "react";
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

interface Invitation {
  id: string;
  code: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  is_active: boolean;
}

export default function InvitationsPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [daysValid, setDaysValid] = useState(30);

  useEffect(() => {
    if (!isLoading && (!user || !user.is_admin)) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const fetchInvitations = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(buildApiUrl("/api/admin/invitations"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch invitations");
      }
      const data = await response.json();
      setInvitations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (user && user.is_admin && token) {
      fetchInvitations();
    }
  }, [user, token, fetchInvitations]);

  const createInvitations = async (count: number) => {
    setIsCreating(true);
    try {
      const response = await fetch(buildApiUrl("/api/admin/invitations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ count, days_valid: daysValid }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to create invitations");
      }
      const data = await response.json();
      setSuccess(`Created ${count} invitation code(s): ${data.invitations.map((i: { code: string }) => i.code).join(", ")}`);
      setTimeout(() => setSuccess(""), 10000);
      await fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setTimeout(() => setError(""), 3000);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteInvitation = async (id: string) => {
    if (!window.confirm("Delete this invitation code? This action cannot be undone.")) return;

    try {
      const response = await fetch(buildApiUrl(`/api/admin/invitations/${id}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete invitation");
      }
      setSuccess("Invitation deleted successfully");
      setTimeout(() => setSuccess(""), 3000);
      await fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setTimeout(() => setError(""), 3000);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setSuccess("Code copied to clipboard");
    setTimeout(() => setSuccess(""), 2000);
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
              <h1 className="text-3xl font-bold mb-2">Invitation Codes</h1>
              <p className="text-muted-foreground">Manage invitation codes for user registration</p>
            </div>
            <Link
              href="/admin"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Back to Admin
            </Link>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-sm">
              {success}
            </div>
          )}

          {/* Create New Invitation */}
          <div className="glass-card rounded-3xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Create New Invitation Code</h2>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Valid for (days)</label>
                <input
                  type="number"
                  value={daysValid}
                  onChange={(e) => setDaysValid(parseInt(e.target.value) || 30)}
                  className="w-32 px-4 py-2 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  min="1"
                />
              </div>
              <button
                onClick={() => createInvitations(1)}
                disabled={isCreating}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create 1 Code"}
              </button>
              <button
                onClick={() => createInvitations(5)}
                disabled={isCreating}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create 5 Codes"}
              </button>
              <button
                onClick={() => createInvitations(10)}
                disabled={isCreating}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create 10 Codes"}
              </button>
            </div>
          </div>

          {/* Invitations List */}
          <div className="glass-card rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-6 font-medium text-muted-foreground">Code</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Expires</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Used By</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-6">
                        <div className="flex items-center gap-2">
                          <code className="px-3 py-1 bg-muted rounded-md font-mono text-sm">
                            {inv.code}
                          </code>
                          <button
                            onClick={() => copyToClipboard(inv.code)}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors"
                            title="Copy to clipboard"
                          >
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="p-6">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            inv.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {inv.is_active ? "Active" : "Used"}
                        </span>
                      </td>
                      <td className="p-6 text-muted-foreground">
                        {formatDate(inv.expires_at)}
                      </td>
                      <td className="p-6 text-muted-foreground">
                        {inv.used_by ? (
                          <span className="text-foreground">User ID: {inv.used_by.slice(0, 8)}...</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-6">
                        <button
                          onClick={() => deleteInvitation(inv.id)}
                          className="px-4 py-2 rounded-xl bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-all"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invitations.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                No invitation codes found. Create one above.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

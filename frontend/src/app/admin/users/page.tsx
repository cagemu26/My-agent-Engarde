"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api";
import { TopNav } from "@/components/top-nav";
import { useLocale } from "@/lib/locale";

const ADMIN_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/history", label: "History" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

export default function UsersPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const { isZh } = useLocale();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const usersFetchAbortRef = useRef<AbortController | null>(null);
  const usersFetchRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isLoading && (!user || !user.is_admin)) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    if (usersFetchAbortRef.current) {
      usersFetchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    usersFetchAbortRef.current = abortController;
    const requestId = usersFetchRequestIdRef.current + 1;
    usersFetchRequestIdRef.current = requestId;

    try {
      const response = await fetch(buildApiUrl("/api/admin/users"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: abortController.signal,
      });
      if (abortController.signal.aborted || requestId !== usersFetchRequestIdRef.current) {
        return;
      }
      if (!response.ok) {
        throw new Error(isZh ? "获取用户失败" : "Failed to fetch users");
      }
      const data = await response.json();
      if (abortController.signal.aborted || requestId !== usersFetchRequestIdRef.current) {
        return;
      }
      setUsers(data);
      setError("");
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError") ||
        requestId !== usersFetchRequestIdRef.current
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : isZh ? "发生错误" : "An error occurred");
    } finally {
      if (requestId === usersFetchRequestIdRef.current) {
        setLoading(false);
      }
      if (usersFetchAbortRef.current === abortController) {
        usersFetchAbortRef.current = null;
      }
    }
  }, [isZh, token]);

  useEffect(() => {
    if (user && user.is_admin && token) {
      fetchUsers();
    }
  }, [user, token, fetchUsers]);

  useEffect(() => {
    return () => {
      if (usersFetchAbortRef.current) {
        usersFetchAbortRef.current.abort();
        usersFetchAbortRef.current = null;
      }
    };
  }, []);

  const toggleUser = async (userId: string) => {
    try {
      const response = await fetch(buildApiUrl(`/api/admin/users/${userId}/toggle`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to toggle user");
      }
      setSuccess(isZh ? "用户状态更新成功" : "User status updated successfully");
      setTimeout(() => setSuccess(""), 3000);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "发生错误" : "An error occurred");
      setTimeout(() => setError(""), 3000);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(isZh ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
              <h1 className="text-3xl font-bold mb-2">{isZh ? "用户管理" : "User Management"}</h1>
              <p className="text-muted-foreground">{isZh ? "管理已注册用户" : "Manage registered users"}</p>
            </div>
            <Link
              href="/admin"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {isZh ? "返回管理后台" : "Back to Admin"}
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

          <div className="glass-card rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-6 font-medium text-muted-foreground">{isZh ? "用户名" : "Username"}</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">{isZh ? "邮箱" : "Email"}</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">{isZh ? "状态" : "Status"}</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">{isZh ? "角色" : "Admin"}</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">{isZh ? "注册时间" : "Joined"}</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">{isZh ? "操作" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-6 font-medium">{u.username}</td>
                      <td className="p-6 text-muted-foreground">{u.email}</td>
                      <td className="p-6">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            u.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {u.is_active ? (isZh ? "启用" : "Active") : isZh ? "禁用" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-6">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            u.is_admin
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {u.is_admin ? (isZh ? "管理员" : "Admin") : isZh ? "普通用户" : "User"}
                        </span>
                      </td>
                      <td className="p-6 text-muted-foreground">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="p-6">
                        {u.id !== user.id && (
                          <button
                            onClick={() => toggleUser(u.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                              u.is_active
                                ? "bg-red-100 text-red-700 hover:bg-red-200"
                                : "bg-green-100 text-green-700 hover:bg-green-200"
                            }`}
                          >
                            {u.is_active ? (isZh ? "停用" : "Deactivate") : isZh ? "启用" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

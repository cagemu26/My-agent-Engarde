"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api";

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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isLoading && (!user || !user.is_admin)) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(buildApiUrl("/api/admin/users"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (user && user.is_admin && token) {
      fetchUsers();
    }
  }, [user, token, fetchUsers]);

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
      setSuccess("User status updated successfully");
      setTimeout(() => setSuccess(""), 3000);
      await fetchUsers();
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

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform duration-300">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">Engarde</span>
              <span className="font-bold text-xl text-red-600">AI</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/admin" className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors">
              Admin
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.username}</span>
            <Link
              href="/"
              className="px-4 py-2 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-all"
            >
              Back
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">User Management</h1>
              <p className="text-muted-foreground">Manage registered users</p>
            </div>
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
                    <th className="text-left p-6 font-medium text-muted-foreground">Username</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Email</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Admin</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Joined</th>
                    <th className="text-left p-6 font-medium text-muted-foreground">Actions</th>
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
                          {u.is_active ? "Active" : "Inactive"}
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
                          {u.is_admin ? "Admin" : "User"}
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
                            {u.is_active ? "Deactivate" : "Activate"}
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

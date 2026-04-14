"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/top-nav";
import { useLocale } from "@/lib/locale";

const ADMIN_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/history", label: "History" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { isZh } = useLocale();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!user) {
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
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-2">{isZh ? "管理后台" : "Admin Dashboard"}</h1>
              <p className="text-muted-foreground">{isZh ? "管理你的应用" : "Manage your application"}</p>
            </div>
            <div className="flex items-center gap-2">
              {user.is_admin && (
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                  {isZh ? "管理员" : "Admin"}
                </span>
              )}
              <Link
                href="/"
                className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {isZh ? "返回首页" : "Back to Home"}
              </Link>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* User Management Card */}
            <Link href="/admin/users">
              <div className="glass-card rounded-3xl p-8 hover-lift transition-all duration-300 cursor-pointer">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold mb-2">{isZh ? "用户管理" : "User Management"}</h2>
                <p className="text-muted-foreground">
                  {isZh
                    ? "查看和管理注册用户，切换用户状态，并管理管理员权限。"
                    : "View and manage registered users, toggle user status, and manage admin privileges."}
                </p>
              </div>
            </Link>

            {/* Invitation Codes Card */}
            <Link href="/admin/invitations">
              <div className="glass-card rounded-3xl p-8 hover-lift transition-all duration-300 cursor-pointer">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold mb-2">{isZh ? "邀请码管理" : "Invitation Codes"}</h2>
                <p className="text-muted-foreground">
                  {isZh
                    ? "创建、查看和管理用于用户注册的邀请码。"
                    : "Create, view, and manage invitation codes for user registration."}
                </p>
              </div>
            </Link>

            {/* Feedback Card */}
            <Link href="/admin/feedback">
              <div className="glass-card rounded-3xl p-8 hover-lift transition-all duration-300 cursor-pointer">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold mb-2">{isZh ? "用户反馈" : "User Feedback"}</h2>
                <p className="text-muted-foreground">
                  {isZh
                    ? "查看并管理用户反馈、问题报告和功能建议。"
                    : "View and manage user feedback, bug reports, and feature requests."}
                </p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

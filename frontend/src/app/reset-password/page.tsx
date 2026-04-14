"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";
import { useLocale } from "@/lib/locale";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-[120px] animate-pulse" />
        <div
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div className="absolute inset-0 section-grid opacity-30" />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="text-center mb-8">
      <Link href="/" className="inline-flex items-center">
        <BrandLogo variant="lockup" tone="dark" size="sm" />
      </Link>
    </div>
  );
}

function PasswordResetRequest() {
  const { isZh } = useLocale();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await fetch(buildApiUrl("/api/auth/password-reset"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      setError(isZh ? "发生错误，请稍后重试" : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <AuthShell>
        <div className="glass-card rounded-3xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">{isZh ? "请查收邮箱" : "Check Your Email"}</h2>
          <p className="text-muted-foreground mb-6">
            {isZh
              ? "如果该邮箱对应账号存在，我们已发送重置密码链接。"
              : "If an account with that email exists, we&apos;ve sent a password reset link."}
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
          >
            {isZh ? "返回登录" : "Back to Login"}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <BrandHeader />
      <div className="glass-card rounded-3xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">{isZh ? "重置密码" : "Reset Password"}</h1>
          <p className="text-muted-foreground">{isZh ? "输入邮箱以接收重置链接" : "Enter your email to receive a reset link"}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleRequest} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              {isZh ? "邮箱" : "Email"}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (isZh ? "发送中..." : "Sending...") : isZh ? "发送重置链接" : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-muted-foreground hover:text-foreground text-sm">
            {isZh ? "返回登录" : "Back to Login"}
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

function PasswordResetConfirm({ token }: { token: string }) {
  const { isZh } = useLocale();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(isZh ? "两次输入的密码不一致" : "Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError(isZh ? "密码至少需要 6 位" : "Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(buildApiUrl("/api/auth/password-reset/confirm"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, new_password: password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.message || (isZh ? "密码重置失败" : "Password reset failed"));
      }
    } catch {
      setError(isZh ? "发生错误，请稍后重试" : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell>
        <div className="glass-card rounded-3xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">{isZh ? "密码已重置！" : "Password Reset!"}</h2>
          <p className="text-muted-foreground mb-6">
            {isZh ? "你的密码已成功重置。" : "Your password has been reset successfully."}
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
          >
            {isZh ? "前往登录" : "Go to Login"}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <BrandHeader />
      <div className="glass-card rounded-3xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">{isZh ? "设置新密码" : "New Password"}</h1>
          <p className="text-muted-foreground">{isZh ? "输入你的新密码" : "Enter your new password"}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              {isZh ? "新密码" : "New Password"}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder={isZh ? "请输入新密码" : "Enter new password"}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
              {isZh ? "确认密码" : "Confirm Password"}
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder={isZh ? "请再次输入新密码" : "Confirm new password"}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (isZh ? "重置中..." : "Resetting...") : isZh ? "重置密码" : "Reset Password"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-muted-foreground hover:text-foreground text-sm">
            {isZh ? "返回登录" : "Back to Login"}
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

function PasswordResetContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (!token) {
    return <PasswordResetRequest />;
  }

  return <PasswordResetConfirm token={token} />;
}

export default function PasswordResetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600" />
        </div>
      }
    >
      <PasswordResetContent />
    </Suspense>
  );
}

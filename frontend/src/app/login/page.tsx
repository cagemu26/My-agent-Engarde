"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";
import { useLocale } from "@/lib/locale";

export default function LoginPage() {
  const { isZh } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMessage("");
    setIsLoading(true);

    try {
      await login(email, password);
      router.push("/analyze");
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "登录失败" : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError(isZh ? "请先输入邮箱地址" : "Please enter your email first");
      return;
    }

    setIsResending(true);
    setResendMessage("");

    try {
      const response = await fetch(buildApiUrl("/api/auth/resend-verification"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || (isZh ? "重新发送验证邮件失败" : "Failed to resend verification email"));
      }
      setError("");
      setResendMessage(data.message || (isZh ? "验证邮件已发送" : "Verification email sent"));
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "重新发送验证邮件失败" : "Failed to resend verification email");
    } finally {
      setIsResending(false);
    }
  };

  const shouldShowResend = error === "Please verify your email before logging in";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }}></div>
        <div className="absolute inset-0 section-grid opacity-30"></div>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center">
            <BrandLogo variant="lockup" tone="dark" size="sm" />
          </Link>
        </div>

        {/* Login Card */}
        <div className="glass-card rounded-3xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">{isZh ? "欢迎回来" : "Welcome Back"}</h1>
            <p className="text-muted-foreground">{isZh ? "登录你的账号" : "Sign in to your account"}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}
          {shouldShowResend && (
            <div className="mb-6">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResending}
                className="w-full py-2 px-4 rounded-xl border border-red-500/40 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResending ? (isZh ? "发送中..." : "Sending...") : isZh ? "重新发送验证邮件" : "Resend verification email"}
              </button>
            </div>
          )}
          {resendMessage && (
            <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-sm">
              {resendMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                {isZh ? "密码" : "Password"}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                placeholder={isZh ? "请输入密码" : "Enter your password"}
              />
            </div>

            <div className="text-right">
              <Link href="/reset-password" className="text-sm text-red-600 hover:underline">
                {isZh ? "忘记密码？" : "Forgot password?"}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (isZh ? "登录中..." : "Signing in...") : isZh ? "登录" : "Sign In"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              {isZh ? "还没有账号？" : "Don&apos;t have an account?"}{" "}
              <Link href="/register" className="text-red-600 font-medium hover:underline">
                {isZh ? "使用邀请码注册" : "Register with invitation code"}
              </Link>
            </p>
          </div>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
            {isZh ? "返回首页" : "Back to home"}
          </Link>
        </div>
      </div>
    </div>
  );
}

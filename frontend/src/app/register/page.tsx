"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";
import { useLocale } from "@/lib/locale";

export default function RegisterPage() {
  const { isZh } = useLocale();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [registered, setRegistered] = useState(false);
  const { register } = useAuth();

  const verifyCode = async () => {
    if (!invitationCode.trim()) {
      setError(isZh ? "请输入邀请码" : "Please enter an invitation code");
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const response = await fetch(buildApiUrl(`/api/auth/codes/verify/${invitationCode}`));
      const data = await response.json();

      if (data.valid) {
        setCodeVerified(true);
      } else {
        setError(data.message || (isZh ? "邀请码无效" : "Invalid invitation code"));
        setCodeVerified(false);
      }
    } catch {
      setError(isZh ? "邀请码验证失败" : "Failed to verify invitation code");
      setCodeVerified(false);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await register(email, username, password, invitationCode);
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "注册失败" : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

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

        {/* Register Card */}
        <div className="glass-card rounded-3xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">Create Account</h1>
            <p className="text-muted-foreground">{isZh ? "使用邀请码加入" : "Join with an invitation code"}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          {registered ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">{isZh ? "请查收邮箱" : "Check Your Email"}</h2>
              <p className="text-muted-foreground mb-2">
                {isZh ? "我们已发送验证链接到" : "We&apos;ve sent a verification link to"}
              </p>
              <p className="font-medium text-foreground mb-6">{email}</p>
              <p className="text-sm text-muted-foreground mb-6">
                {isZh
                  ? "请点击邮件中的链接完成验证，验证后即可登录。"
                  : "Click the link in the email to verify your account. After verification, you can log in."}
              </p>
              <Link
                href="/login"
                className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
              >
                {isZh ? "前往登录" : "Go to Login"}
              </Link>
            </div>
          ) : !codeVerified ? (
            <div className="space-y-5">
              <div>
                <label htmlFor="invitationCode" className="block text-sm font-medium mb-2">
                  {isZh ? "邀请码" : "Invitation Code"}
                </label>
                <input
                  id="invitationCode"
                  type="text"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  placeholder={isZh ? "请输入邀请码" : "Enter your invitation code"}
                />
              </div>

              <button
                type="button"
                onClick={verifyCode}
                disabled={verifying}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifying ? (isZh ? "验证中..." : "Verifying...") : isZh ? "验证邀请码" : "Verify Code"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-sm text-center mb-4">
                {isZh ? "邀请码验证通过！" : "Invitation code verified!"}
              </div>

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
                <label htmlFor="username" className="block text-sm font-medium mb-2">
                  {isZh ? "用户名" : "Username"}
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  placeholder={isZh ? "设置用户名" : "Choose a username"}
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
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  placeholder={isZh ? "设置密码（至少 6 位）" : "Create a password (min 6 characters)"}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (isZh ? "创建中..." : "Creating account...") : isZh ? "创建账号" : "Create Account"}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              {isZh ? "已有账号？" : "Already have an account?"}{" "}
              <Link href="/login" className="text-red-600 font-medium hover:underline">
                {isZh ? "去登录" : "Sign in"}
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

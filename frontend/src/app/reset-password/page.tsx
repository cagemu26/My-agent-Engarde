"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildApiUrl } from "@/lib/api";

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
      <Link href="/" className="inline-flex items-center gap-3 group">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform duration-300">
          <span className="text-white font-bold text-xl">E</span>
        </div>
        <div>
          <span className="font-bold text-2xl tracking-tight">Engarde</span>
          <span className="font-bold text-2xl text-red-600">AI</span>
        </div>
      </Link>
    </div>
  );
}

function PasswordResetRequest() {
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
      setError("An error occurred");
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
          <h2 className="text-2xl font-bold mb-2">Check Your Email</h2>
          <p className="text-muted-foreground mb-6">
            If an account with that email exists, we&apos;ve sent a password reset link.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
          >
            Back to Login
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
          <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
          <p className="text-muted-foreground">Enter your email to receive a reset link</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleRequest} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
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
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-muted-foreground hover:text-foreground text-sm">
            Back to Login
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

function PasswordResetConfirm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
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
        setError(data.message || "Password reset failed");
      }
    } catch {
      setError("An error occurred");
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
          <h2 className="text-2xl font-bold mb-2">Password Reset!</h2>
          <p className="text-muted-foreground mb-6">Your password has been reset successfully.</p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
          >
            Go to Login
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
          <h1 className="text-2xl font-bold mb-2">New Password</h1>
          <p className="text-muted-foreground">Enter your new password</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-muted-foreground hover:text-foreground text-sm">
            Back to Login
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

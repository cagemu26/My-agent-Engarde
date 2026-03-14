"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function FeedbackPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [category, setCategory] = useState("general");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          title,
          content,
        }),
      });

      if (response.ok) {
        setSubmitted(true);
      } else {
        const data = await response.json();
        setError(data.detail || "Failed to submit feedback");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
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
            <div className="flex items-center gap-4">
              <Link href="/" className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                Home
              </Link>
            </div>
          </div>
        </nav>

        <main className="pt-32 pb-20 relative">
          <div className="max-w-md mx-auto px-6">
            <div className="glass-card rounded-3xl p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Feedback Submitted!</h2>
              <p className="text-muted-foreground mb-6">
                Thank you for your feedback. We will review it shortly.
              </p>
              <Link
                href="/"
                className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
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
          <div className="flex items-center gap-4">
            <Link href="/" className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Home
            </Link>
            {user ? (
              <Link href="/" className="px-4 py-2 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-all">
                {user.username}
              </Link>
            ) : (
              <Link href="/login" className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 relative">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Feedback</h1>
            <p className="text-muted-foreground">Help us improve Engarde AI</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="glass-card rounded-3xl p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "bug", label: "Bug Report", icon: "🐛" },
                    { value: "feature", label: "Feature Request", icon: "💡" },
                    { value: "general", label: "General", icon: "💬" },
                  ].map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        category === cat.value
                          ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                          : "border-border hover:border-red-300"
                      }`}
                    >
                      <span className="text-2xl block mb-1">{cat.icon}</span>
                      <span className="text-sm font-medium">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-2">
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  placeholder="Brief summary of your feedback"
                />
              </div>

              <div>
                <label htmlFor="content" className="block text-sm font-medium mb-2">
                  Details
                </label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none"
                  placeholder="Please describe your feedback in detail..."
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Submitting..." : "Submit Feedback"}
              </button>
            </form>
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>We appreciate your feedback and will respond as soon as possible.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

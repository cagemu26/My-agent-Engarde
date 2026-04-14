"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { buildApiUrl } from "@/lib/api";
import { useLocale } from "@/lib/locale";

function VerifyEmailContent() {
  const { isZh } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const verifyEmail = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setMessage(isZh ? "无效的验证令牌" : "Invalid verification token");
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/api/auth/verify/${token}`));
      const data = await response.json();

      if (response.ok && data.success) {
        setStatus("success");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.message || (isZh ? "验证失败" : "Verification failed"));
      }
    } catch {
      setStatus("error");
      setMessage(isZh ? "验证过程中发生错误" : "An error occurred during verification");
    }
  }, [isZh, token]);

  useEffect(() => {
    if (token) {
      verifyEmail();
    } else {
      setStatus("error");
      setMessage(isZh ? "无效的验证令牌" : "Invalid verification token");
    }
  }, [isZh, token, verifyEmail]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }}></div>
        <div className="absolute inset-0 section-grid opacity-30"></div>
      </div>

      <div className="w-full max-w-md">
        <div className="glass-card rounded-3xl p-8 text-center">
          {status === "loading" && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-red-600 mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold mb-2">{isZh ? "邮箱验证中" : "Verifying Email"}</h2>
              <p className="text-muted-foreground">{isZh ? "请稍候..." : "Please wait..."}</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">{isZh ? "邮箱验证成功！" : "Email Verified!"}</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <button
                onClick={() => router.push("/login")}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
              >
                {isZh ? "前往登录" : "Go to Login"}
              </button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">{isZh ? "验证失败" : "Verification Failed"}</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <button
                onClick={() => router.push("/")}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
              >
                {isZh ? "返回首页" : "Back to Home"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

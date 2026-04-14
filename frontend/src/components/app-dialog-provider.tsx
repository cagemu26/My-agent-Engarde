"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "@/lib/locale";

type DialogKind = "alert" | "confirm";

interface AlertDialogOptions {
  title?: string;
  description?: string;
  confirmText?: string;
}

interface ConfirmDialogOptions extends AlertDialogOptions {
  cancelText?: string;
  danger?: boolean;
}

interface ActiveDialog extends ConfirmDialogOptions {
  kind: DialogKind;
}

interface AppDialogContextValue {
  alert: (options: string | AlertDialogOptions) => Promise<void>;
  confirm: (options: string | ConfirmDialogOptions) => Promise<boolean>;
}

const AppDialogContext = createContext<AppDialogContextValue | undefined>(undefined);

const normalizeDialogOptions = (
  options: string | AlertDialogOptions | ConfirmDialogOptions,
  kind: DialogKind,
  isZh: boolean,
): ActiveDialog => {
  if (typeof options === "string") {
    return {
      kind,
      title: kind === "confirm" ? (isZh ? "请确认" : "Please confirm") : isZh ? "提示" : "Notice",
      description: options,
      confirmText: kind === "confirm" ? (isZh ? "确认" : "Confirm") : "OK",
      cancelText: isZh ? "取消" : "Cancel",
      danger: false,
    };
  }

  return {
    kind,
    title:
      options.title?.trim() ||
      (kind === "confirm" ? (isZh ? "请确认" : "Please confirm") : isZh ? "提示" : "Notice"),
    description: options.description?.trim() || "",
    confirmText: options.confirmText?.trim() || (kind === "confirm" ? (isZh ? "确认" : "Confirm") : "OK"),
    cancelText:
      "cancelText" in options ? options.cancelText?.trim() || (isZh ? "取消" : "Cancel") : isZh ? "取消" : "Cancel",
    danger: "danger" in options ? Boolean(options.danger) : false,
  };
};

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const { isZh } = useLocale();
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const closeDialog = useCallback((confirmed: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (resolver) {
      resolver(confirmed);
    }
  }, []);

  const confirm = useCallback((options: string | ConfirmDialogOptions) => {
    const config = normalizeDialogOptions(options, "confirm", isZh);
    return new Promise<boolean>((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
      setDialog(config);
    });
  }, [isZh]);

  const alert = useCallback((options: string | AlertDialogOptions) => {
    const config = normalizeDialogOptions(options, "alert", isZh);
    return new Promise<void>((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = () => resolve();
      setDialog(config);
    });
  }, [isZh]);

  useEffect(() => {
    if (!dialog) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (dialog.kind === "confirm") {
        closeDialog(false);
      } else {
        closeDialog(true);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [closeDialog, dialog]);

  const contextValue = useMemo<AppDialogContextValue>(
    () => ({
      alert,
      confirm,
    }),
    [alert, confirm],
  );

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      {dialog ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={isZh ? "关闭弹窗" : "Close dialog"}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => closeDialog(dialog.kind === "confirm" ? false : true)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            className="relative w-full max-w-md rounded-2xl border border-border/80 bg-background/95 p-6 shadow-2xl"
          >
            <h2 id="app-dialog-title" className="text-lg font-semibold text-foreground">
              {dialog.title}
            </h2>
            {dialog.description ? (
              <p className="mt-2 whitespace-pre-line text-sm text-foreground/80">{dialog.description}</p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              {dialog.kind === "confirm" ? (
                <button
                  type="button"
                  onClick={() => closeDialog(false)}
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {dialog.cancelText}
                </button>
              ) : null}
              <button
                type="button"
                autoFocus
                onClick={() => closeDialog(true)}
                className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors ${
                  dialog.kind === "confirm" && dialog.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                }`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return context;
}

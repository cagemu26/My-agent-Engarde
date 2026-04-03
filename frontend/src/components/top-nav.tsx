"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";
import { UserAvatarMenu } from "@/components/user-avatar-menu";

export interface TopNavLink {
  href: string;
  label: string;
  adminOnly?: boolean;
}

interface TopNavProps {
  activeHref?: string;
  links: TopNavLink[];
  surface?: "default" | "marketing";
}

type ThemeMode = "light" | "dark";
const THEME_STORAGE_KEY = "engarde.theme";

function ThemeIcon({ theme }: { theme: ThemeMode }) {
  if (theme === "dark") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 118.646 3.646a7 7 0 0011.708 11.708z"
        />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v2m0 14v2m7.778-9H17.78M6.22 12H4.222m13.435 6.364l-1.414-1.414M7.757 7.05 6.343 5.636m11.314 0-1.414 1.414M7.757 16.95l-1.414 1.414M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

export function TopNav({ activeHref, links, surface = "default" }: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);
  const { user, logout, isLoading } = useAuth();
  const isMarketing = surface === "marketing";

  const visibleLinks = links.filter((link) => !link.adminOnly || user?.is_admin);
  const navSurfaceClass = isMarketing
    ? "bg-background/92 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/86"
    : "bg-background/96 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/90";

  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const nextTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : systemTheme;
    root.classList.toggle("dark", nextTheme === "dark");
    setTheme(nextTheme);
    setThemeReady(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  };

  return (
    <nav className={`fixed left-0 right-0 top-0 z-50 border-b border-border/80 ${navSurfaceClass}`}>
      <div className="mx-auto flex h-[74px] max-w-[1240px] items-center justify-between gap-3 px-5 md:px-7">
        <Link href="/" className="group inline-flex items-center">
          <BrandLogo variant="lockup" tone={themeReady && theme === "dark" ? "light" : "dark"} size="sm" />
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
          <div
            className={
              isMarketing
                ? "flex items-center gap-1"
                : "flex items-center gap-1 rounded-full border border-border/80 bg-card/70 p-1"
            }
          >
            {visibleLinks.map((link) => {
              const active = link.href === activeHref;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={false}
                  className={`rounded-full px-4 py-2 text-[15px] font-medium tracking-[-0.01em] transition-colors duration-200 ${
                    isMarketing
                      ? "text-foreground/75 hover:bg-muted/70 hover:text-foreground"
                      : active
                        ? "bg-muted text-foreground shadow-sm"
                        : "text-foreground/75 hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none"
          >
            <ThemeIcon theme={theme} />
          </button>
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <>
              {isMarketing ? (
                <Link
                  href="/analyze"
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Open Workspace
                </Link>
              ) : null}
              <UserAvatarMenu user={user} onLogout={logout} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation menu"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground md:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/70 bg-background/98 backdrop-blur md:hidden">
          <div className="space-y-2 px-5 py-4">
            {visibleLinks.map((link) => {
              const active = link.href === activeHref;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className={`block rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-foreground/80 hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-[15px] font-medium text-foreground hover:bg-muted"
              >
                <span className="text-foreground/80">
                  <ThemeIcon theme={theme} />
                </span>
                <span>Switch to {theme === "dark" ? "Light" : "Dark"} mode</span>
              </button>
              {isLoading ? (
                <div className="h-9 w-32 animate-pulse rounded-full bg-muted" />
              ) : user ? (
                <div className="px-3 py-2">
                  {isMarketing ? (
                    <Link
                      href="/analyze"
                      onClick={() => setMobileOpen(false)}
                      className="mb-2 block rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Open Workspace
                    </Link>
                  ) : null}
                  <UserAvatarMenu
                    user={user}
                    compact
                    align="left"
                    onProfileClick={() => setMobileOpen(false)}
                    onHistoryClick={() => setMobileOpen(false)}
                    onLogout={() => {
                      logout();
                      setMobileOpen(false);
                    }}
                  />
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted/70 hover:text-foreground"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-xl bg-red-600 px-3.5 py-2.5 text-sm font-semibold text-white"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

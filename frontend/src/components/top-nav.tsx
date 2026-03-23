"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";

export interface TopNavLink {
  href: string;
  label: string;
  adminOnly?: boolean;
}

interface TopNavProps {
  activeHref?: string;
  links: TopNavLink[];
}

export function TopNav({ activeHref, links }: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, isLoading } = useAuth();

  const visibleLinks = links.filter((link) => !link.adminOnly || user?.is_admin);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
        <Link href="/" className="group inline-flex items-center">
          <BrandLogo variant="lockup" tone="light" size="md" />
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {visibleLinks.map((link) => {
            const active = link.href === activeHref;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover-lift ${
                  active
                    ? "text-red-600 hover:text-red-700"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-3">
          {isLoading ? (
            <div className="h-10 w-28 rounded-xl bg-muted animate-pulse" />
          ) : user ? (
            <>
              <span className="text-sm text-muted-foreground">{user.username}</span>
              <button
                onClick={logout}
                className="px-4 py-2 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-all duration-300"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 rounded-xl text-muted-foreground font-medium hover:text-foreground transition-colors"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300"
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
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/70 text-foreground"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-background/90 backdrop-blur-xl">
          <div className="px-6 py-4 space-y-2">
            {visibleLinks.map((link) => {
              const active = link.href === activeHref;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="pt-2 mt-2 border-t border-border/60 space-y-2">
              {isLoading ? (
                <div className="h-9 w-36 rounded-lg bg-muted animate-pulse" />
              ) : user ? (
                <>
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {user.username}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setMobileOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-red-600 to-red-700 text-white"
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

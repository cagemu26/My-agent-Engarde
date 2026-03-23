"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { TopNav } from "@/components/top-nav";

const HOME_NAV_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/training", label: "Training" },
  { href: "/feedback", label: "Feedback" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

const VALUE_PILLARS = [
  {
    title: "Frame-by-frame technical review",
    description:
      "Break down footwork, posture, distance control, and recovery patterns with grounded pose data.",
  },
  {
    title: "Context-aware AI coaching",
    description:
      "Turn one bout into practical next steps, cue words, and short training blocks you can use immediately.",
  },
  {
    title: "One workspace for video and feedback",
    description:
      "Upload footage, revisit past sessions, and keep your coaching conversation tied to the right match.",
  },
] as const;

const PROOF_STRIP = [
  { value: "Pose + Chat", label: "Integrated workflow" },
  { value: "3 Weapons", label: "Foil, Epee, Sabre" },
  { value: "Video History", label: "Session tracking" },
] as const;

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Upload a bout or drill clip",
    description: "Attach a video, add match context, and choose the weapon you want analyzed.",
  },
  {
    step: "02",
    title: "Review the movement picture",
    description: "Inspect pose overlays, frame coverage, and the technical report generated from the session.",
  },
  {
    step: "03",
    title: "Convert insight into training",
    description: "Ask follow-up questions and leave with a focused drill plan instead of vague feedback.",
  },
] as const;

const WEAPON_FOCUS = [
  {
    title: "Foil",
    tone: "Priority on timing, line, and right-of-way discipline.",
    accent: "from-orange-500 to-orange-600",
    surface: "from-orange-50 to-orange-100/60 dark:from-orange-950/30 dark:to-orange-900/10",
    border: "hover:border-orange-400/50",
    mark: "F",
  },
  {
    title: "Epee",
    tone: "Distance management, patience, and whole-body target awareness.",
    accent: "from-red-600 to-red-700",
    surface: "from-red-50 to-red-100/60 dark:from-red-950/30 dark:to-red-900/10",
    border: "hover:border-red-400/50",
    mark: "E",
  },
  {
    title: "Sabre",
    tone: "Fast starts, tempo changes, and cleaner attacking decisions.",
    accent: "from-cyan-500 to-sky-500",
    surface: "from-cyan-50 to-cyan-100/60 dark:from-cyan-950/30 dark:to-cyan-900/10",
    border: "hover:border-cyan-400/50",
    mark: "S",
  },
] as const;

const RECENT_SIGNALS = [
  "Front knee collapses late in the lunge.",
  "Recovery footwork is slower than the attack phase.",
  "Distance control improves after the second exchange.",
] as const;

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[8%] top-0 h-[520px] w-[520px] rounded-full bg-red-500/10 blur-[140px]" />
        <div className="absolute right-[10%] top-[12%] h-[420px] w-[420px] rounded-full bg-amber-400/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[560px] w-[760px] -translate-x-1/2 rounded-full bg-red-500/5 blur-[160px]" />
        <div className="absolute inset-0 section-grid opacity-40" />
        <div className="absolute left-10 top-28 h-24 w-24 rotate-12 rounded-[2rem] border border-red-200/30" />
        <div className="absolute bottom-28 right-16 h-20 w-20 rounded-full border border-amber-200/30" />
      </div>

      <TopNav links={[...HOME_NAV_LINKS]} />

      <main className="relative pb-20 pt-28 md:pt-32">
        <div className="mx-auto max-w-7xl px-6">
          <section className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-200/70 bg-gradient-to-r from-red-50 to-amber-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Built for fencers who train with intent.
              </div>

              <h1 className="max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl md:leading-[0.96]">
                Train from footage.
                <span className="gradient-text block">Compete with clarity.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-foreground/75 md:text-xl">
                Engarde AI turns bout video into technical corrections, tactical review, and drill-ready next steps.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/analyze"
                  className="group inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-red-500/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-red-500/30"
                >
                  Start Analysis
                  <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-red-200 bg-white/70 px-8 py-4 text-lg font-semibold text-red-700 backdrop-blur hover:border-red-400 hover:bg-white"
                >
                  View Demo
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Link>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {PROOF_STRIP.map((item) => (
                  <div key={item.label} className="glass-card rounded-2xl border border-border/50 p-4">
                    <p className="text-base font-semibold text-foreground">{item.value}</p>
                    <p className="mt-1 text-sm text-foreground/75">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="glass-card overflow-hidden rounded-[2rem] border border-white/30 shadow-2xl shadow-red-500/10">
                <div className="border-b border-border/60 bg-gradient-to-r from-red-600 to-red-700 px-6 py-5 text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-red-100">Sample Session</p>
                      <h2 className="mt-2 text-2xl font-bold">Regional Epee Final</h2>
                    </div>
                    <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur">
                      <p className="text-xs uppercase tracking-wide text-red-100">Status</p>
                      <p className="mt-1 text-sm font-semibold">Context linked to coach</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl bg-secondary/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-foreground/75">Coverage</p>
                      <p className="mt-2 text-3xl font-bold text-foreground">82%</p>
                      <p className="mt-1 text-sm text-foreground/75">Pose frames kept for review</p>
                    </div>
                    <div className="rounded-2xl bg-secondary/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-foreground/75">Lunge Distance</p>
                      <p className="mt-2 text-3xl font-bold text-foreground">1.84m</p>
                      <p className="mt-1 text-sm text-foreground/75">Average attack extension</p>
                    </div>
                    <div className="rounded-2xl bg-secondary/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-foreground/75">Recovery Time</p>
                      <p className="mt-2 text-3xl font-bold text-foreground">0.62s</p>
                      <p className="mt-1 text-sm text-foreground/75">Back to en garde average</p>
                    </div>
                  </div>

                  <div className="rounded-[1.75rem] border border-border/60 bg-card/80 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-foreground/75">Coach Summary</p>
                        <h3 className="mt-2 text-xl font-semibold text-foreground">What the system would flag first</h3>
                      </div>
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-200">
                        Priority Fixes
                      </span>
                    </div>
                    <div className="mt-5 space-y-3">
                      {RECENT_SIGNALS.map((signal) => (
                        <div
                          key={signal}
                          className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
                        >
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-r from-red-500 to-amber-500" />
                          <p className="text-sm leading-6 text-foreground">{signal}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-red-200/70 bg-white/80 px-4 py-3 shadow-lg backdrop-blur md:max-w-[22rem]">
                <p className="text-xs uppercase tracking-wide text-foreground/75">Output</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Video review + drill priorities + chat handoff</p>
              </div>
            </div>
          </section>

          <section className="mt-24">
            <div className="mb-10 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-600">Why Engarde AI</p>
              <h2 className="mt-3 text-3xl font-bold md:text-4xl">Faster review. Clear next actions.</h2>
              <p className="mt-4 text-lg text-foreground/75">
                Move from raw footage to coaching decisions with technical clarity and repeatable training priorities.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {VALUE_PILLARS.map((pillar, index) => (
                <div key={pillar.title} className="glass-card rounded-[1.75rem] border border-border/60 p-7">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-amber-500 text-lg font-bold text-white">
                    {index + 1}
                  </div>
                  <h3 className="mt-6 text-2xl font-bold">{pillar.title}</h3>
                  <p className="mt-3 leading-7 text-foreground/75">{pillar.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-24">
            <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-600">Workflow</p>
                <h2 className="mt-3 text-3xl font-bold md:text-4xl">From raw clip to coaching decision in three moves.</h2>
              </div>
              <Link href="/analyze" className="text-sm font-semibold text-red-600 hover:text-red-700">
                Open Workspace
              </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {WORKFLOW_STEPS.map((step) => (
                <div key={step.step} className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/80 p-7">
                  <div className="pointer-events-none absolute right-5 top-5 text-5xl font-bold text-red-100 dark:text-red-950/60">{step.step}</div>
                  <div className="relative pr-12">
                    <h3 className="text-2xl font-bold">{step.title}</h3>
                    <p className="mt-4 leading-7 text-foreground/75">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-24">
            <div className="mb-10 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-600">Weapon Focus</p>
              <h2 className="mt-3 text-3xl font-bold md:text-4xl">Built for how each weapon actually asks questions.</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {WEAPON_FOCUS.map((weapon) => (
                <div
                  key={weapon.title}
                  className={`group relative overflow-hidden rounded-[1.75rem] border border-transparent p-7 transition-all duration-300 ${weapon.border}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${weapon.surface}`} />
                  <div className="relative">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${weapon.accent} text-xl font-bold text-white shadow-lg`}
                    >
                      {weapon.mark}
                    </div>
                    <h3 className="mt-5 text-2xl font-bold">{weapon.title}</h3>
                    <p className="mt-3 leading-7 text-foreground/75">{weapon.tone}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="relative mt-24 overflow-hidden rounded-[2rem]">
            <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-red-600 to-amber-500" />
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-black/10 blur-3xl" />

            <div className="relative flex flex-col gap-8 px-8 py-12 md:px-12 md:py-14 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-100">Ready to test it</p>
                <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
                  Bring one bout. Leave with your next week of work.
                </h2>
                <p className="mt-4 text-lg leading-8 text-red-50">
                  Use the analysis workspace, review an existing clip, or jump into the demo flow if you want to inspect
                  the experience first.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/analyze"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-7 py-4 text-base font-semibold text-red-700 shadow-xl transition hover:-translate-y-1"
                >
                  Start Analysis
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/30 bg-white/10 px-7 py-4 text-base font-semibold text-white backdrop-blur transition hover:bg-white/15"
                >
                  View Demo
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-6 text-center md:flex-row md:text-left">
          <BrandLogo variant="lockup" tone="light" size="sm" withTagline />
          <p className="text-sm text-foreground/75">© 2026 Engarde AI. Built for practical technical review.</p>
        </div>
      </footer>
    </div>
  );
}

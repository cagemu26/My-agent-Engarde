"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { TopNav } from "@/components/top-nav";

const HOME_NAV_LINKS = [
  { href: "#why", label: "Why Engarde AI" },
  { href: "#workflow", label: "Workflow" },
  { href: "#weapon-focus", label: "Weapon Focus" },
  { href: "/demo", label: "Demo" },
] as const;

const TRUST_STRIP = [
  { value: "Pose + Chat", label: "Integrated workflow" },
  { value: "3 Weapons", label: "Foil, Epee, Sabre" },
  { value: "Video History", label: "Session tracking" },
] as const;

const WHY_ITEMS = [
  {
    title: "Frame-by-frame technical review",
    description:
      "Break down posture, distance control, and recovery patterns with grounded pose data.",
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
    summary: "Priority on timing, line, and right-of-way discipline.",
  },
  {
    title: "Epee",
    summary: "Distance management, patience, and full-target decision making.",
  },
  {
    title: "Sabre",
    summary: "Fast starts, tempo changes, and cleaner attacking choices.",
  },
] as const;

const SNAPSHOT_SIGNALS = [
  "Front knee stays loaded longer during attacks.",
  "Recovery phase starts late after touch attempts.",
  "Distance control is cleaner in the final exchanges.",
] as const;

const SNAPSHOT_METRICS = [
  { label: "Tracking Quality", value: "88%" },
  { label: "Stance Width", value: "1.04x" },
  { label: "Lead Knee Angle", value: "136deg" },
  { label: "Weapon-Hand Speed", value: "1.32x/s" },
] as const;

const SNAPSHOT_CONTEXT = [
  { label: "Mode", value: "Pose Detection" },
  { label: "Replay", value: "Original / Skeleton" },
  { label: "Weapon Side", value: "Auto -> Right" },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav links={[...HOME_NAV_LINKS]} surface="marketing" />

      <main className="pb-24 pt-28 md:pt-32">
        <div className="mx-auto max-w-[1180px] px-6">
          <section className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-foreground/85 md:text-[13px]">
                <span className="h-2 w-2 rounded-full bg-red-600" />
                Built for fencers who train with intent.
              </p>

              <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[62px]">
                Train from footage.
                <span className="gradient-text block">Compete with clarity.</span>
              </h1>

              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-foreground/80 md:text-lg md:leading-8">
                Engarde AI turns bout video into technical corrections, tactical review, and drill-ready next steps.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/analyze"
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Start Analysis
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  View Demo
                </Link>
              </div>

              <Link
                href="/analyze"
                className="mt-4 inline-flex text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Open Workspace
              </Link>
            </div>

            <aside className="glass-card animate-fade-up p-5 sm:p-6 md:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Analysis Snapshot</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">Regional Epee Final</h2>
                  <p className="mt-1 text-sm leading-6 text-foreground/75">
                    A quick look at the same signals available in your workspace replay.
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  Context linked
                </span>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SNAPSHOT_CONTEXT.map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-background px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-medium leading-5">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {SNAPSHOT_METRICS.map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-border bg-background p-3.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Coach Notes</p>
                {SNAPSHOT_SIGNALS.map((signal) => (
                  <div key={signal} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-6 text-foreground/85">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
                    <span>{signal}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/analyze"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Open Workspace
                </Link>
                <Link
                  href="/history"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  View History
                </Link>
              </div>
            </aside>
          </section>

          <section className="mt-16 animate-fade-up">
            <div className="grid gap-3 border-y border-border py-6 sm:grid-cols-3">
              {TRUST_STRIP.map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-card px-4 py-3.5">
                  <p className="text-sm font-semibold tracking-tight">{item.value}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="why" className="mt-20 scroll-mt-32 animate-fade-up">
            <div className="mb-7 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">Why Engarde AI</p>
              <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">Faster review. Clear next actions.</h2>
              <p className="mt-3 max-w-xl text-pretty leading-7 text-foreground/80">
                Move from raw footage to coaching decisions with technical clarity and repeatable training priorities.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {WHY_ITEMS.map((item) => (
                <article
                  key={item.title}
                  className="rounded-xl border border-border bg-card p-5 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/80">{item.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="workflow" className="mt-20 scroll-mt-32 animate-fade-up">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">Workflow</p>
                <h2 className="mt-2 max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  From raw clip to coaching decision in three moves.
                </h2>
              </div>
              <Link href="/analyze" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Open Workspace
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {WORKFLOW_STEPS.map((step) => (
                <article key={step.step} className="rounded-xl border border-border bg-card p-5">
                  <p className="inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-semibold tracking-wide text-secondary-foreground">
                    {step.step}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/80">{step.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="weapon-focus" className="mt-20 scroll-mt-32 animate-fade-up">
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">Weapon Focus</p>
              <h2 className="mx-auto mt-2 max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                Built for how each weapon asks tactical questions.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {WEAPON_FOCUS.map((weapon) => (
                <article key={weapon.title} className="rounded-xl border border-border bg-card p-5 text-center">
                  <p className="mx-auto inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">
                    {weapon.title.charAt(0)}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{weapon.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/80">{weapon.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-20 animate-fade-up rounded-2xl border border-border bg-card p-8 md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">Ready to test it</p>
            <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Bring one bout. Leave with your next week of work.
            </h2>
            <p className="mt-3 max-w-2xl text-pretty leading-7 text-foreground/80">
              Use the analysis workspace to upload footage, review technical issues, and walk away with a practical training plan.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/analyze"
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Start Analysis
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                View Demo
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 md:flex-row md:items-center">
          <BrandLogo variant="lockup" tone="dark" size="sm" withTagline />
          <p className="text-sm text-muted-foreground">© 2026 Engarde AI. Built for practical technical review.</p>
        </div>
      </footer>
    </div>
  );
}

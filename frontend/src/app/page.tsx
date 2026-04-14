"use client";

import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { TopNav } from "@/components/top-nav";
import { useLocale } from "@/lib/locale";

const HOME_NAV_LINKS = [
  { href: "#why", label: "Why Engarde AI" },
  { href: "#workflow", label: "Workflow" },
  { href: "#weapon-focus", label: "Weapon Focus" },
  { href: "#contact", label: "Contact" },
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

const XIAOHONGSHU_URL = "https://www.xiaohongshu.com/user/profile/6786125f000000000803cbb5";
const CONTACT_EMAIL = "shanghailinglai@outlook.com";
const WECHAT_QR_SRC = "/contact/wechat-qr.jpg";
const CONTACT_ICON_CLASSNAME =
  "group relative inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground/72 transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35";

export default function Home() {
  const { isZh } = useLocale();
  const homeNavLinks = [...HOME_NAV_LINKS];
  const trustStrip = isZh
    ? [
        { value: "姿态 + 对话", label: "一体化流程" },
        { value: "3 种剑", label: "花剑 / 重剑 / 佩剑" },
        { value: "视频历史", label: "会话追踪" },
      ]
    : [...TRUST_STRIP];
  const whyItems = isZh
    ? [
        {
          title: "逐帧技术复盘",
          description: "基于姿态数据拆解站姿、距离控制和回收节奏，定位关键动作问题。",
        },
        {
          title: "上下文感知 AI 指导",
          description: "把一段比赛视频转成可执行的训练重点、口令提示和短周期计划。",
        },
        {
          title: "视频与反馈同一工作区",
          description: "上传视频、回看历史、持续对话，所有分析都绑定在对应比赛上下文中。",
        },
      ]
    : [...WHY_ITEMS];
  const workflowSteps = isZh
    ? [
        { step: "01", title: "上传比赛或训练片段", description: "添加视频、比赛信息并选择剑种。" },
        { step: "02", title: "查看动作全貌", description: "检查骨架回放、覆盖帧和技术报告。" },
        { step: "03", title: "转化为训练计划", description: "继续追问并拿到明确、可执行的下一步训练。" },
      ]
    : [...WORKFLOW_STEPS];
  const weaponFocus = isZh
    ? [
        { title: "花剑", summary: "重点关注优先权节奏、线路控制与进攻时机。" },
        { title: "重剑", summary: "强调距离管理、耐心博弈与全身目标决策。" },
        { title: "佩剑", summary: "聚焦启动速度、节奏变化与进攻选择质量。" },
      ]
    : [...WEAPON_FOCUS];
  const snapshotSignals = isZh
    ? [
        "进攻阶段前腿蓄力时间更长。",
        "触击后回收启动略晚。",
        "最后几次交换中的距离控制更稳定。",
      ]
    : [...SNAPSHOT_SIGNALS];
  const snapshotMetrics = isZh
    ? [
        { label: "追踪质量", value: "88%" },
        { label: "站姿宽度", value: "1.04x" },
        { label: "前腿膝角", value: "136deg" },
        { label: "持剑手速度", value: "1.32x/s" },
      ]
    : [...SNAPSHOT_METRICS];
  const snapshotContext = isZh
    ? [
        { label: "模式", value: "姿态检测" },
        { label: "回放", value: "原视频 / 骨架" },
        { label: "惯用侧", value: "自动 -> 右手" },
      ]
    : [...SNAPSHOT_CONTEXT];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav links={homeNavLinks} surface="marketing" />

      <main className="pb-24 pt-28 md:pt-32">
        <div className="mx-auto max-w-[1180px] px-6">
          <section className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-foreground/85 md:text-[13px]">
                <span className="h-2 w-2 rounded-full bg-red-600" />
                {isZh ? "为有目标训练的击剑者打造。" : "Built for fencers who train with intent."}
              </p>

              <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[62px]">
                {isZh ? "从视频中训练。" : "Train from footage."}
                <span className="gradient-text block">{isZh ? "以清晰策略上场。" : "Compete with clarity."}</span>
              </h1>

              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-foreground/80 md:text-lg md:leading-8">
                {isZh
                  ? "Engarde AI 将比赛视频转化为技术修正、战术复盘和可直接执行的训练下一步。"
                  : "Engarde AI turns bout video into technical corrections, tactical review, and drill-ready next steps."}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/analyze"
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  {isZh ? "开始分析" : "Start Analysis"}
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  {isZh ? "查看演示" : "View Demo"}
                </Link>
              </div>

              <Link
                href="/analyze"
                className="mt-4 inline-flex text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {isZh ? "进入工作台" : "Open Workspace"}
              </Link>
            </div>

            <aside className="glass-card animate-fade-up p-5 sm:p-6 md:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{isZh ? "分析快照" : "Analysis Snapshot"}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">{isZh ? "地区重剑决赛" : "Regional Epee Final"}</h2>
                  <p className="mt-1 text-sm leading-6 text-foreground/75">
                    {isZh
                      ? "快速预览你在工作台回放中可看到的同类关键指标。"
                      : "A quick look at the same signals available in your workspace replay."}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  {isZh ? "已关联上下文" : "Context linked"}
                </span>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {snapshotContext.map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-background px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-medium leading-5">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {snapshotMetrics.map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-border bg-background p-3.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{isZh ? "教练备注" : "Coach Notes"}</p>
                {snapshotSignals.map((signal) => (
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
                  {isZh ? "进入工作台" : "Open Workspace"}
                </Link>
                <Link
                  href="/history"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  {isZh ? "查看历史" : "View History"}
                </Link>
              </div>
            </aside>
          </section>

          <section className="mt-16 animate-fade-up">
            <div className="grid gap-3 border-y border-border py-6 sm:grid-cols-3">
              {trustStrip.map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-card px-4 py-3.5">
                  <p className="text-sm font-semibold tracking-tight">{item.value}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="why" className="mt-20 scroll-mt-32 animate-fade-up">
            <div className="mb-7 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">{isZh ? "为什么选择 Engarde AI" : "Why Engarde AI"}</p>
              <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">{isZh ? "复盘更快，下一步更清晰。" : "Faster review. Clear next actions."}</h2>
              <p className="mt-3 max-w-xl text-pretty leading-7 text-foreground/80">
                {isZh
                  ? "从原始视频快速走到教练决策，获得清晰技术结论与可重复执行的训练优先级。"
                  : "Move from raw footage to coaching decisions with technical clarity and repeatable training priorities."}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {whyItems.map((item) => (
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
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">{isZh ? "使用流程" : "Workflow"}</p>
                <h2 className="mt-2 max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  {isZh ? "三步把原始片段转成训练决策。" : "From raw clip to coaching decision in three moves."}
                </h2>
              </div>
              <Link href="/analyze" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                {isZh ? "进入工作台" : "Open Workspace"}
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {workflowSteps.map((step) => (
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
                {isZh ? "针对不同剑种的战术问题而设计。" : "Built for how each weapon asks tactical questions."}
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {weaponFocus.map((weapon) => (
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">{isZh ? "准备开始" : "Ready to test it"}</p>
            <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              {isZh ? "带来一段比赛，带走下一周训练计划。" : "Bring one bout. Leave with your next week of work."}
            </h2>
            <p className="mt-3 max-w-2xl text-pretty leading-7 text-foreground/80">
              {isZh
                ? "在分析工作台上传视频、查看技术问题，并形成可落地的训练计划。"
                : "Use the analysis workspace to upload footage, review technical issues, and walk away with a practical training plan."}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/analyze"
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                {isZh ? "开始分析" : "Start Analysis"}
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {isZh ? "查看演示" : "View Demo"}
              </Link>
            </div>
          </section>

          <section id="contact" className="mt-16 scroll-mt-32 animate-fade-up">
            <div className="mx-auto max-w-md text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-600">
                {isZh ? "联系我们" : "Contact Us"}
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground/72">
                {isZh ? "通过小红书、微信或邮件与我们联系。" : "Reach us on Xiaohongshu, WeChat, or email."}
              </p>

              <div className="mt-5 flex items-center justify-center gap-3 sm:gap-4">
                <a
                  href={XIAOHONGSHU_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={isZh ? "打开小红书" : "Open Xiaohongshu"}
                  className={CONTACT_ICON_CLASSNAME}
                >
                  <span className="text-[10px] font-black uppercase tracking-tight">RED</span>
                  <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground opacity-0 shadow-sm transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
                    {isZh ? "打开小红书主页" : "Open Xiaohongshu"}
                  </span>
                </a>

                <button
                  type="button"
                  aria-label={isZh ? "查看微信二维码" : "View WeChat QR code"}
                  className={CONTACT_ICON_CLASSNAME}
                >
                  <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M8.3 7.2c-2.8 0-5 1.8-5 4.2 0 1.2.6 2.3 1.7 3.1l-.4 2 2-1c.5.1 1 .2 1.6.2 2.8 0 5-1.9 5-4.3 0-2.3-2.2-4.2-4.9-4.2Zm7.5 2.6c2.8 0 4.9 1.8 4.9 4.1 0 1.3-.7 2.4-1.8 3.1l.4 1.8-1.9-.9c-.5.1-1.1.2-1.6.2-2.8 0-4.9-1.9-4.9-4.2 0-2.3 2.1-4.1 4.9-4.1Z"
                      fill="currentColor"
                    />
                  </svg>
                  <div className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-3 w-[180px] -translate-x-1/2 rounded-xl border border-border bg-popover p-2 opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    <Image
                      src={WECHAT_QR_SRC}
                      alt={isZh ? "微信二维码" : "WeChat QR code"}
                      width={164}
                      height={164}
                      className="h-auto w-full rounded-lg"
                    />
                  </div>
                </button>

                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  aria-label={isZh ? "发送邮件" : "Send email"}
                  className={CONTACT_ICON_CLASSNAME}
                >
                  <svg className="h-[21px] w-[21px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 7.25A1.75 1.75 0 0 1 6.25 5.5h11.5a1.75 1.75 0 0 1 1.75 1.75v9.5a1.75 1.75 0 0 1-1.75 1.75H6.25a1.75 1.75 0 0 1-1.75-1.75v-9.5Z"
                      fill="currentColor"
                    />
                    <path d="m5.7 8.05 6.3 4.45 6.3-4.45" stroke="hsl(var(--background))" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground opacity-0 shadow-sm transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
                    {CONTACT_EMAIL}
                  </span>
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 md:flex-row md:items-center">
          <BrandLogo variant="lockup" tone="dark" size="sm" withTagline />
          <p className="text-sm text-muted-foreground">
            {isZh
              ? "© 2026 Engarde AI。为实战技术复盘打造。"
              : "© 2026 Engarde AI. Built for practical technical review."}
          </p>
        </div>
      </footer>
    </div>
  );
}

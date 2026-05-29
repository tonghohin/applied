import { LandingNav } from "@/components/landing/landing-nav";
import { Reveal } from "@/components/landing/scroll-reveal";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Kicker } from "@/components/ui/kicker";
import {
  RiArrowRightLine,
  RiCheckLine,
  RiEqualizerLine,
  RiFocus3Line,
  RiHistoryLine,
  RiQuillPenLine,
  RiRadarLine,
  RiRobot2Line,
  RiSendPlaneLine,
} from "@remixicon/react";
import Link from "next/link";

const STEPS = [
  {
    number: "01",
    Icon: RiRadarLine,
    title: "Scrape",
    description:
      "Point it at LinkedIn. Applied pulls every Easy Apply role that matches the criteria you set — location, work type, seniority.",
  },
  {
    number: "02",
    Icon: RiFocus3Line,
    title: "Score",
    description:
      "Each role is scored against your real profile and tiered strong, potential, or weak. No keyword soup — actual fit.",
  },
  {
    number: "03",
    Icon: RiSendPlaneLine,
    title: "Apply",
    description:
      "The agent fills the form, writes the cover letter in your voice, and submits — logging every step as it goes.",
  },
];

const LOG_ENTRIES = [
  { timestamp: "10:24:01 AM", message: "Opening application form", success: false },
  { timestamp: "10:24:04 AM", message: "Filling contact details", success: false },
  { timestamp: "10:24:08 AM", message: "Generating cover letter", success: false },
  { timestamp: "10:24:12 AM", message: "Answering screening questions", success: false },
  { timestamp: "10:24:14 AM", message: "Submitted", success: true },
];

const FEATURES = [
  {
    Icon: RiEqualizerLine,
    title: "Matching that fits",
    description: "Roles scored against your profile and criteria, not a keyword filter.",
  },
  {
    Icon: RiQuillPenLine,
    title: "Cover letters, written",
    description: "Tailored to each posting, in your voice — not a template.",
  },
  {
    Icon: RiRobot2Line,
    title: "Easy Apply, on autopilot",
    description: "A browser agent drives the application form end to end.",
  },
  {
    Icon: RiHistoryLine,
    title: "Every run, logged",
    description: "Timestamped runs and apply logs. See exactly what happened.",
  },
];

export default function Home() {
  return (
    <>
      <LandingNav />
      <main>
        {/* ── Hero ─────────────────────────────────────────── */}
        <header className="pt-28 pb-16 text-center" id="top">
          <Container>
            <Kicker>LinkedIn Easy Apply, automated</Kicker>
            <h1 className="mx-auto mt-5 max-w-[14ch] text-balance font-bold text-[clamp(44px,7vw,84px)] leading-none tracking-tighter">
              Stop applying.
              <span className="block text-primary">Start arriving.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground leading-relaxed">
              Applied scrapes LinkedIn for roles that match your profile, scores each one, and
              submits the Easy Apply applications for you — cover letter and all.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" className="h-11 px-5" nativeButton={false} render={<Link href="/sign-in" />}>
                Get started
                <RiArrowRightLine size={16} />
              </Button>
              <Button variant="outline" size="lg" className="h-11 px-5" nativeButton={false} render={<Link href="#how" />}>
                See how it works
              </Button>
            </div>
          </Container>
        </header>

        {/* ── How it works ─────────────────────────────────── */}
        <section className="pt-16 pb-24 max-[900px]:py-16" id="how">
          <Container>
            <Reveal className="max-w-2xl">
              <Kicker>How it works</Kicker>
              <h2 className="mt-4 font-semibold text-3xl tracking-tight">
                Three moves, then it runs on its own.
              </h2>
              <p className="mt-3 max-w-xl text-base text-muted-foreground leading-relaxed">
                You set it up once. The agent handles the repetitive part — the part you were never
                going to enjoy anyway.
              </p>
            </Reveal>
            <div className="mt-12 grid grid-cols-3 gap-7 max-[900px]:grid-cols-1 max-[900px]:gap-0">
              {STEPS.map((step, i) => (
                <Reveal
                  key={step.number}
                  className={[
                    "relative border-border border-t pt-6",
                    "max-[900px]:py-6",
                    i === 0 ? "max-[900px]:border-t-0 max-[900px]:pt-0" : "",
                  ].join(" ")}
                >
                  <span className="font-medium font-mono text-primary text-xs tracking-wide">
                    {step.number}
                  </span>
                  <h3 className="mt-4 font-semibold text-lg tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                  <div className="mt-4 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
                    <step.Icon size={18} />
                  </div>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        {/* ── Transparency / apply-log showcase ────────────── */}
        <section className="bg-secondary py-24 max-[900px]:py-16" id="transparency">
          <Container className="grid grid-cols-[0.85fr_1.15fr] items-center gap-14 max-[900px]:grid-cols-1 max-[900px]:gap-9">
            <Reveal>
              <Kicker>Nothing happens in the dark</Kicker>
              <h2 className="mt-4 font-semibold text-3xl tracking-tight">
                Watch every move it makes.
              </h2>
              <p className="mt-3 text-base text-muted-foreground leading-relaxed">
                Every application is a logged run. Timestamped steps, the cover letter it wrote, and
                a clear reason whenever something stops — so you stay in control without doing the
                work.
              </p>
              <ul className="mt-6 flex list-none flex-col gap-3 p-0">
                <li className="flex items-start gap-3 text-sm leading-relaxed">
                  <RiCheckLine className="mt-px shrink-0 text-primary" size={16} />
                  Step-by-step apply logs for every submission
                </li>
                <li className="flex items-start gap-3 text-sm leading-relaxed">
                  <RiCheckLine className="mt-px shrink-0 text-primary" size={16} />
                  Failures explained, never buried
                </li>
                <li className="flex items-start gap-3 text-sm leading-relaxed">
                  <RiCheckLine className="mt-px shrink-0 text-primary" size={16} />
                  Review before apply, or let it run
                </li>
              </ul>
            </Reveal>
            <Reveal className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/10 ring-inset dark:ring-white/12">
              <div className="flex items-center justify-between border-border border-b px-5 py-3.5">
                <span className="flex items-center gap-2 font-medium text-sm">
                  Apply log{" "}
                  <span className="font-normal text-muted-foreground">
                    · Staff Software Engineer, Acme Corp
                  </span>
                </span>
                <span className="inline-flex h-5 items-center rounded-full bg-primary/15 px-2.5 font-medium text-primary text-xs dark:bg-primary/20">
                  applied
                </span>
              </div>
              <div className="flex flex-col gap-2 p-5 font-mono text-xs leading-relaxed">
                {LOG_ENTRIES.map((entry) => (
                  <div className="flex gap-4" key={entry.timestamp}>
                    <span className="w-24 shrink-0 text-muted-foreground/65">
                      {entry.timestamp}
                    </span>
                    <span className={entry.success ? "text-primary" : "text-foreground"}>
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          </Container>
        </section>

        {/* ── Features ─────────────────────────────────────── */}
        <section className="py-24 max-[900px]:py-16" id="features">
          <Container>
            <Reveal className="max-w-2xl">
              <Kicker>What it handles</Kicker>
              <h2 className="mt-4 font-semibold text-3xl tracking-tight">
                The tedious parts, taken off your plate.
              </h2>
            </Reveal>
            <div className="mt-12 grid grid-cols-4 gap-5 max-[560px]:grid-cols-1 max-[900px]:grid-cols-2">
              {FEATURES.map((feature) => (
                <Reveal
                  key={feature.title}
                  className="rounded-xl bg-card p-6 ring-1 ring-black/10 ring-inset dark:ring-white/12"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <feature.Icon size={20} />
                  </div>
                  <h3 className="font-semibold text-sm">{feature.title}</h3>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        {/* ── Closing CTA ───────────────────────────────────── */}
        <section className="bg-primary text-primary-foreground" id="get-started">
          <Container className="py-24 text-center">
            <h2 className="mx-auto max-w-[16ch] font-bold text-[clamp(36px,5vw,60px)] leading-none tracking-tighter">
              Stop applying. Start arriving.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base text-primary-foreground/80 leading-relaxed">
              Set your criteria once. Let the agent do the applying — and hand you back the results.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                variant="ghost"
                size="lg"
                className="h-11 bg-background px-5 text-primary hover:bg-background/90"
                nativeButton={false}
                render={<Link href="/sign-in" />}
              >
                Get started
                <RiArrowRightLine size={16} />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="h-11 border border-white/30 px-5 text-primary-foreground hover:bg-white/10"
                nativeButton={false}
                render={<Link href="/sign-in" id="signin" />}
              >
                Sign in
              </Button>
            </div>
          </Container>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-border border-t bg-secondary pt-14 pb-16">
        <Container>
          <div className="flex flex-wrap items-start justify-between gap-10">
            <div>
              <img className="h-7 dark:hidden" src="/lockup.svg" alt="Applied" />
              <img className="hidden h-7 dark:block" src="/lockup-on-dark.svg" alt="Applied" />
              <p className="mt-4 max-w-xs text-muted-foreground text-sm leading-relaxed">
                Automated job applications. The agent finds matching jobs, writes the cover letters,
                and submits them.
              </p>
            </div>
            <div className="flex flex-wrap gap-16 max-[560px]:gap-9">
              {[
                {
                  heading: "Product",
                  links: [
                    { label: "How it works", href: "#how" },
                    { label: "Features", href: "#features" },
                    { label: "Apply logs", href: "#transparency" },
                  ],
                },
                {
                  heading: "Account",
                  links: [
                    { label: "Sign in", href: "/sign-in" },
                    { label: "Get started", href: "/sign-in" },
                  ],
                },
                {
                  heading: "Company",
                  links: [
                    { label: "Privacy", href: "/privacy" },
                    { label: "Terms", href: "/terms" },
                    { label: "Contact", href: "/contact" },
                  ],
                },
              ].map((col) => (
                <div key={col.heading}>
                  <h4 className="mb-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    {col.heading}
                  </h4>
                  {col.links.map((l) => (
                    <a
                      key={l.label}
                      className="block py-1 text-foreground text-sm no-underline transition-colors hover:text-primary"
                      href={l.href}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-border border-t pt-6">
            <span className="text-muted-foreground text-xs">
              © {new Date().getFullYear()} Applied
            </span>
            <span className="font-mono text-muted-foreground text-xs">applied.cv</span>
          </div>
        </Container>
      </footer>
    </>
  );
}

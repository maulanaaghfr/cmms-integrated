import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, Database, Bell, Users, LayoutDashboard, Lightbulb, AlertTriangle,
  GitBranch, Flag, CheckCircle2,
} from "lucide-react";
import { Card, Pill } from "./kit";
import { ROLE_JOURNEYS } from "../data/roleJourneys";

function JourneyStep({ index, step, isLast }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex gap-4">
      {/* rail */}
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
          {index + 1}
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      {/* card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.24), ease: [0.22, 1, 0.36, 1] }}
        className="soft-card mb-4 w-full rounded-2xl border border-border/70 bg-card"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        >
          <div>
            <h4 className="font-display text-sm font-bold text-foreground">{step.title}</h4>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{step.desc}</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-2.5 border-t border-border/60 px-4 py-3.5">
                <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="flex items-start gap-1.5 rounded-lg bg-accent/5 px-2.5 py-2 text-xs text-foreground">
                    <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span><span className="font-semibold">Data:</span> {step.dataUpdate}</span>
                  </div>
                  <div className="flex items-start gap-1.5 rounded-lg bg-[hsl(var(--warning))]/5 px-2.5 py-2 text-xs text-foreground">
                    <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
                    <span><span className="font-semibold">Notifikasi:</span> {step.notif}</span>
                  </div>
                  <div className="flex items-start gap-1.5 rounded-lg bg-primary/5 px-2.5 py-2 text-xs text-foreground">
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span><span className="font-semibold">Interaksi:</span> {step.interaction}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function InfoList({ icon: Icon, title, items, tone = "primary" }) {
  const tones = {
    primary: "text-primary bg-primary/10",
    success: "text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
    warning: "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
    danger: "text-destructive bg-destructive/10",
    accent: "text-accent bg-accent/10",
  };
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h4 className="font-display text-sm font-bold text-foreground">{title}</h4>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function RoleJourney() {
  const [roleTab, setRoleTab] = useState(ROLE_JOURNEYS[0].id);
  const active = ROLE_JOURNEYS.find((r) => r.id === roleTab)?.data;

  return (
    <div className="space-y-6">
      {/* role sub-tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border/70 bg-card p-1.5 soft-card">
        {ROLE_JOURNEYS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoleTab(r.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition active:scale-[0.98] ${
              roleTab === r.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <motion.div key={roleTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
        {/* trigger banner */}
        <Card className="!p-4 border-primary/20 bg-primary/5">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Flag className="h-4 w-4" />
            </div>
            <div>
              <Pill tone="primary" className="mb-1">Trigger — {active.role}</Pill>
              <p className="text-sm text-foreground">{active.trigger}</p>
            </div>
          </div>
        </Card>

        {/* journey map / timeline */}
        <div>
          <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Journey Map & Step-by-Step Guide
          </h3>
          <div className="flex flex-col">
            {active.steps.map((s, i) => (
              <JourneyStep key={s.title} index={i} step={s} isLast={i === active.steps.length - 1} />
            ))}
          </div>
        </div>

        {/* meta grid */}
        <div className="grid gap-4 md:grid-cols-2">
          <InfoList icon={Bell} title="Notifications Timeline" items={active.notifications} tone="warning" />
          <InfoList icon={LayoutDashboard} title="Dashboard Overview" items={active.dashboard} tone="accent" />
          <InfoList icon={Lightbulb} title="Best Practices" items={active.bestPractices} tone="success" />
          <InfoList icon={AlertTriangle} title="Common Issues & Solutions" items={active.issues} tone="danger" />
        </div>

        <Card>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitBranch className="h-4 w-4" />
            </div>
            <h4 className="font-display text-sm font-bold text-foreground">Common Scenarios</h4>
          </div>
          <ul className="mt-3 space-y-2.5">
            {active.scenarios.map((s) => (
              <li key={s} className="rounded-xl bg-muted/40 px-3.5 py-3 text-sm leading-relaxed text-foreground">
                {s}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="!p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Related Journeys & Flows</p>
          <div className="flex flex-wrap gap-1.5">
            {active.related.map((r) => (
              <Pill key={r} tone="muted">{r}</Pill>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

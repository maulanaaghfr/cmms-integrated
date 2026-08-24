import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Shield, Building2, Users, Wrench, ClipboardList, Package, Truck, Boxes,
  ArrowRight, ArrowDown, ArrowLeft, Bell, Database, CheckCircle2, XCircle,
  ChevronDown, LayoutGrid, GitBranch, ShoppingCart, CalendarClock, Boxes as Life,
  Table2, HelpCircle, Sparkles, Route, Workflow,
} from "lucide-react";
import Logo from "../components/Logo";
import { Card, Pill } from "../components/kit";
import RoleJourney from "../components/RoleJourney";
import CompleteSystemFlow from "../components/CompleteSystemFlow";

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

const ROLE_COLORS = {
  "Super Admin": "bg-violet-100 text-violet-700 border-violet-200",
  "Company Admin": "bg-blue-100 text-blue-700 border-blue-200",
  "Manager": "bg-cyan-100 text-cyan-700 border-cyan-200",
  "Technician": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Operator": "bg-amber-100 text-amber-700 border-amber-200",
  "Vendor": "bg-rose-100 text-rose-700 border-rose-200",
  "Warehouse": "bg-slate-100 text-slate-700 border-slate-200",
  "System": "bg-primary/10 text-primary border-primary/20",
};

function RolePill({ role }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[role] || "bg-muted text-muted-foreground border-border"}`}>
      {role}
    </span>
  );
}

function FlowArrow({ vertical }) {
  return vertical ? (
    <div className="flex justify-center py-1 text-muted-foreground/60 md:hidden">
      <ArrowDown className="h-5 w-5" />
    </div>
  ) : (
    <div className="hidden items-center px-1 text-muted-foreground/50 md:flex">
      <ArrowRight className="h-6 w-6" />
    </div>
  );
}

function StepCard({ index, icon: Icon, title, role, desc, dataUpdate, notif }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
      className="soft-card group relative flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 md:w-64"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <span className="font-display text-xs font-bold text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div>
        <RolePill role={role} />
        <h4 className="mt-2 font-display text-sm font-bold leading-snug text-foreground">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      {(dataUpdate || notif) && (
        <div className="mt-auto space-y-1.5 border-t border-border/60 pt-2">
          {dataUpdate && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Database className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
              <span>{dataUpdate}</span>
            </div>
          )}
          {notif && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Bell className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--warning))]" />
              <span>{notif}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function FlowDiagram({ steps }) {
  return (
    <div className="flex flex-col items-stretch gap-0 overflow-x-auto pb-2 md:flex-row md:items-stretch md:gap-0">
      {steps.map((s, i) => (
        <React.Fragment key={s.title}>
          <StepCard index={i} {...s} />
          {i < steps.length - 1 && <FlowArrow vertical />}
          {i < steps.length - 1 && <FlowArrow />}
        </React.Fragment>
      ))}
    </div>
  );
}

function FlowMeta({ trigger, participants, outcome, example, tips, issues }) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card className="!p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Trigger</p>
        <p className="mt-1 text-sm text-foreground">{trigger}</p>
      </Card>
      <Card className="!p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Partisipan</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {participants.map((p) => <RolePill key={p} role={p} />)}
        </div>
      </Card>
      <Card className="!p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Outcome</p>
        <p className="mt-1 text-sm text-foreground">{outcome}</p>
      </Card>
      <Card className="!p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Contoh Skenario</p>
        <p className="mt-1 text-sm text-foreground">{example}</p>
      </Card>
      <Card className="!p-4 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[hsl(var(--success))]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Best Practice
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-foreground">
          {tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </Card>
      <Card className="!p-4 border-destructive/30 bg-destructive/5">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-destructive">
          <XCircle className="h-3.5 w-3.5" /> Masalah Umum
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-foreground">
          {issues.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flow data                                                            */
/* ------------------------------------------------------------------ */

const WORK_ORDER_FLOW = [
  { icon: ClipboardList, role: "Manager", title: "Buat Work Order", desc: "Manager atau teknisi membuat WO manual, atau otomatis dari maintenance request yang disetujui.", dataUpdate: "WO baru tersimpan dengan nomor unik" },
  { icon: Users, role: "Manager", title: "Assign Teknisi", desc: "Sistem merekomendasikan teknisi berdasar skill & ketersediaan; manager menetapkan penugasan.", notif: "Teknisi menerima notifikasi in-app & push" },
  { icon: CheckCircle2, role: "Technician", title: "Terima & Mulai", desc: "Teknisi menerima assignment, menekan Start — timer pelacakan waktu dimulai.", dataUpdate: "Status → In Progress" },
  { icon: ClipboardList, role: "Technician", title: "Checklist & Dokumentasi", desc: "Teknisi menyelesaikan checklist, menambah foto before/during/after, catatan lapangan.", dataUpdate: "Checklist & foto tersimpan di WO" },
  { icon: Boxes, role: "Technician", title: "Gunakan Spare Part", desc: "Part yang dipakai dicatat pada WO — stok gudang otomatis berkurang secara real-time.", dataUpdate: "Stok inventory ter-deduksi otomatis" },
  { icon: Wrench, role: "Technician", title: "Selesaikan & Tanda Tangan", desc: "Teknisi mengisi ringkasan penyelesaian dan menangkap tanda tangan digital.", notif: "Manager menerima notifikasi 'Menunggu Approval'" },
  { icon: Shield, role: "Manager", title: "Review & Approve", desc: "Manager memeriksa hasil pekerjaan, kualitas, dan biaya sebelum menutup WO.", dataUpdate: "Status → Completed / Closed" },
  { icon: Bell, role: "System", title: "Notifikasi & Penutupan", desc: "Semua pihak terkait (operator, admin) menerima notifikasi penutupan WO.", notif: "Riwayat maintenance & performa teknisi terupdate" },
];

const REQUEST_FLOW = [
  { icon: ClipboardList, role: "Operator", title: "Submit Request", desc: "Operator melaporkan masalah: pilih equipment, kategori isu, prioritas, foto, lokasi.", dataUpdate: "Request tersimpan status Submitted" },
  { icon: Bell, role: "Manager", title: "Notifikasi Manager", desc: "Manager/Admin menerima notifikasi real-time atas request baru.", notif: "Push + in-app notification" },
  { icon: Shield, role: "Manager", title: "Review Detail", desc: "Manager meninjau deskripsi, foto, riwayat asset terkait sebelum memutuskan.", dataUpdate: "Status → Under Review" },
  { icon: CheckCircle2, role: "Manager", title: "Approve → Buat WO", desc: "Jika disetujui, sistem otomatis membuat Work Order bernomor (WO-YYYY-MM-XXX).", dataUpdate: "WO baru terhubung ke request" },
  { icon: Users, role: "Manager", title: "Assign Teknisi", desc: "Manager menugaskan teknisi yang sesuai skill untuk mengeksekusi WO tersebut.", notif: "Teknisi menerima notifikasi assignment" },
  { icon: Wrench, role: "Technician", title: "Eksekusi Work Order", desc: "Mengikuti Flow Work Order A: mulai, checklist, part, selesai, approval.", dataUpdate: "Status request ikut ter-update otomatis" },
  { icon: Bell, role: "Operator", title: "Notifikasi Selesai", desc: "Operator menerima notifikasi ketika WO selesai; request otomatis Closed.", notif: "Operator dapat melihat ringkasan penyelesaian" },
];

const PROCUREMENT_FLOW = [
  { icon: Package, role: "Technician", title: "Request Spare Part", desc: "Kebutuhan part diajukan dari WO atau permintaan manual oleh teknisi/manager.", dataUpdate: "Permintaan part tercatat" },
  { icon: Shield, role: "Manager", title: "Review Kebutuhan", desc: "Manager memvalidasi kebutuhan, memilih vendor dari daftar terdaftar.", dataUpdate: "-" },
  { icon: ShoppingCart, role: "Manager", title: "Buat Purchase Order", desc: "Sistem generate nomor PO otomatis (PO-YYYY-XXX) berikut item, qty, dan harga.", dataUpdate: "PO status Draft → Sent" },
  { icon: Truck, role: "Vendor", title: "Konfirmasi & Quotation", desc: "Vendor menerima PO, memberikan konfirmasi & quotation (harga, lead time).", notif: "Manager menerima notifikasi quotation masuk" },
  { icon: CheckCircle2, role: "Manager", title: "Approve Quotation", desc: "Manager membandingkan & menyetujui quotation terbaik dari vendor.", dataUpdate: "PO status → Confirmed" },
  { icon: Truck, role: "Vendor", title: "Pengiriman Barang", desc: "Vendor mengirim barang sesuai jadwal yang disepakati.", dataUpdate: "PO status → Shipped" },
  { icon: Boxes, role: "Warehouse", title: "Terima & Verifikasi", desc: "Gudang menerima barang, memverifikasi jumlah & kondisi, lalu update stok.", dataUpdate: "Stok inventory bertambah (stock in)" },
  { icon: Table2, role: "Manager", title: "Invoice & Pembayaran", desc: "Manager mencocokkan invoice, menyetujui pembayaran, PO ditutup.", dataUpdate: "PO status → Paid / Closed" },
];

const PREVENTIVE_FLOW = [
  { icon: CalendarClock, role: "Manager", title: "Buat Rencana PM", desc: "Manager membuat maintenance plan: asset, frekuensi (harian/bulanan/kuartalan), checklist.", dataUpdate: "Plan tersimpan dengan trigger" },
  { icon: Sparkles, role: "System", title: "Auto-generate WO", desc: "Sistem otomatis membuat Work Order sesuai jadwal atau trigger berbasis kondisi/usage.", dataUpdate: "WO preventive baru muncul di antrian" },
  { icon: Users, role: "Manager", title: "Assign ke Teknisi", desc: "Manager menugaskan WO preventive ke teknisi yang kompeten.", notif: "Teknisi menerima notifikasi jadwal PM" },
  { icon: Wrench, role: "Technician", title: "Eksekusi Maintenance", desc: "Teknisi menjalankan checklist preventive & melengkapi WO seperti biasa.", dataUpdate: "Compliance & histori PM terupdate" },
  { icon: LayoutGrid, role: "Manager", title: "Pantau Compliance", desc: "Sistem melacak rasio planned vs unplanned, efektivitas, dan biaya PM.", dataUpdate: "Analitik MTBF/MTTR & uptime terupdate" },
];

const ASSET_FLOW = [
  { icon: Boxes, role: "Company Admin", title: "Registrasi Asset", desc: "Admin membuat asset baru dengan spesifikasi, lokasi, dan supplier.", dataUpdate: "Kode asset & QR code otomatis dibuat" },
  { icon: CalendarClock, role: "Manager", title: "Set Jadwal Preventive", desc: "Manager mengatur maintenance plan untuk asset tersebut.", dataUpdate: "Plan terhubung ke asset" },
  { icon: Wrench, role: "Technician", title: "Maintenance Berjalan", desc: "Work order corrective & preventive dijalankan sepanjang siklus hidup asset.", dataUpdate: "Riwayat maintenance, biaya, downtime tercatat" },
  { icon: Sparkles, role: "System", title: "AI Health Scoring", desc: "Sistem menghitung skor kesehatan & memprediksi risiko kegagalan berbasis histori.", dataUpdate: "Health score & prediksi kegagalan terupdate" },
  { icon: Shield, role: "Manager", title: "Rencana Penggantian", desc: "Berdasar prediksi & biaya, manager merencanakan retirement/replacement asset.", dataUpdate: "-" },
  { icon: XCircle, role: "Company Admin", title: "Asset Retired", desc: "Asset dinonaktifkan dan dikeluarkan dari daftar aktif sistem.", dataUpdate: "Status asset → Retired" },
];

const ROLES = ["Super Admin", "Company Admin", "Manager", "Technician", "Operator", "Vendor", "Warehouse"];
const PERMISSION_ROWS = [
  { feature: "Manage Clients & Subscription Plans", perms: { "Super Admin": "CRUD", "Company Admin": "-", "Manager": "-", "Technician": "-", "Operator": "-", "Vendor": "-", "Warehouse": "-" } },
  { feature: "Company Settings & Branding", perms: { "Super Admin": "R", "Company Admin": "CRUD", "Manager": "R", "Technician": "-", "Operator": "-", "Vendor": "-", "Warehouse": "-" } },
  { feature: "User Management", perms: { "Super Admin": "CRUD", "Company Admin": "CRUD", "Manager": "R", "Technician": "-", "Operator": "-", "Vendor": "-", "Warehouse": "-" } },
  { feature: "Assets", perms: { "Super Admin": "R", "Company Admin": "CRUD", "Manager": "CRU", "Technician": "R", "Operator": "R", "Vendor": "-", "Warehouse": "-" } },
  { feature: "Work Orders", perms: { "Super Admin": "-", "Company Admin": "CRUD", "Manager": "CRUD", "Technician": "RU (assigned)", "Operator": "-", "Vendor": "-", "Warehouse": "-" } },
  { feature: "Maintenance Requests", perms: { "Super Admin": "-", "Company Admin": "CRUD", "Manager": "Approve", "Technician": "-", "Operator": "Create/R", "Vendor": "-", "Warehouse": "-" } },
  { feature: "Inventory & Warehouse", perms: { "Super Admin": "-", "Company Admin": "CRUD", "Manager": "RU", "Technician": "R (deduct)", "Operator": "-", "Vendor": "-", "Warehouse": "CRUD" } },
  { feature: "Procurement (Vendor & PO)", perms: { "Super Admin": "-", "Company Admin": "CRUD", "Manager": "CRU", "Technician": "-", "Operator": "-", "Vendor": "RU (own)", "Warehouse": "R" } },
  { feature: "Technicians & Certifications", perms: { "Super Admin": "-", "Company Admin": "CRUD", "Manager": "RU", "Technician": "R (own)", "Operator": "-", "Vendor": "-", "Warehouse": "-" } },
  { feature: "Analytics & Reports", perms: { "Super Admin": "System-wide", "Company Admin": "R", "Manager": "R", "Technician": "R (own)", "Operator": "-", "Vendor": "-", "Warehouse": "R" } },
  { feature: "Billing & Subscription", perms: { "Super Admin": "CRUD", "Company Admin": "R/Upgrade", "Manager": "-", "Technician": "-", "Operator": "-", "Vendor": "-", "Warehouse": "-" } },
];

const DATA_MODULES = [
  { icon: ClipboardList, name: "Work Orders", links: ["Inventory (part deduction)", "Technicians (performance)", "Assets (history)", "Notifications"] },
  { icon: Package, name: "Maintenance Requests", links: ["Work Orders (auto-create)", "Notifications", "Assets"] },
  { icon: Boxes, name: "Inventory / Warehouse", links: ["Work Orders (stock out)", "Procurement (stock in)", "Analytics"] },
  { icon: ShoppingCart, name: "Procurement", links: ["Inventory (receiving)", "Vendors", "Billing/Cost"] },
  { icon: Life, name: "Assets", links: ["Work Orders", "Preventive Plans", "AI Insights (health score)"] },
  { icon: Users, name: "Technicians", links: ["Work Orders (assignment)", "Analytics (performance)"] },
  { icon: LayoutGrid, name: "Analytics & AI", links: ["Reads from all modules", "Feeds predictive alerts back to Assets & Work Orders"] },
];

const FAQ = [
  { q: "Bagaimana sistem menentukan teknisi yang di-assign ke work order?", a: "Sistem merekomendasikan teknisi berdasarkan skill matrix, sertifikasi yang relevan, dan ketersediaan (workload saat ini), lalu manager memilih dari rekomendasi tersebut atau memilih manual." },
  { q: "Apa yang terjadi jika request maintenance ditolak?", a: "Request berubah status menjadi Rejected dengan alasan yang diisi manager, operator menerima notifikasi, dan tidak ada Work Order yang dibuat." },
  { q: "Bagaimana stok inventory berkurang otomatis?", a: "Saat teknisi menambahkan spare part yang digunakan pada tab 'Parts' di Work Order, sistem langsung mendeduksi stok di warehouse terkait secara real-time." },
  { q: "Apa perbedaan Starter, Professional, dan Enterprise?", a: "Starter dibatasi 10 asset/5 user/1 lokasi, Professional 100 asset/25 user/5 lokasi dengan fitur lanjutan, Enterprise unlimited dengan semua fitur termasuk AI insight penuh." },
  { q: "Siapa yang bisa melihat data perusahaan lain?", a: "Hanya Super Admin Aitoma yang memiliki visibilitas lintas-perusahaan (biasanya read-only untuk analitik). Setiap Company Admin/Manager/Technician/Operator hanya melihat data perusahaannya sendiri." },
  { q: "Bagaimana Purchase Order terhubung ke Work Order?", a: "PO dapat dibuat langsung dari kebutuhan part pada Work Order tertentu, sehingga histori pembelian dan biaya otomatis tertaut ke WO dan asset terkait." },
];

/* ------------------------------------------------------------------ */
/* Overview architecture diagram                                       */
/* ------------------------------------------------------------------ */

function ArchitectureDiagram() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="soft-card flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-6 py-4">
        <Shield className="h-5 w-5 text-violet-700" />
        <span className="font-display text-sm font-bold text-violet-700">Super Admin Aitoma (Platform Owner)</span>
      </div>
      <ArrowDown className="h-6 w-6 text-muted-foreground/50" />
      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {["PT Nusantara", "PT Maju Jaya", "Klien Lainnya..."].map((c) => (
          <div key={c} className="soft-card rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center">
            <Building2 className="mx-auto h-5 w-5 text-blue-700" />
            <p className="mt-1 font-display text-xs font-bold text-blue-700">{c}</p>
          </div>
        ))}
      </div>
      <ArrowDown className="h-6 w-6 text-muted-foreground/50" />
      <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { r: "Company Admin", i: Shield },
          { r: "Manager", i: ClipboardList },
          { r: "Technician", i: Wrench },
          { r: "Operator", i: Users },
        ].map((x) => (
          <div key={x.r} className="soft-card flex flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-card px-3 py-3">
            <x.i className="h-4 w-4 text-primary" />
            <span className="text-center text-xs font-semibold text-foreground">{x.r}</span>
          </div>
        ))}
      </div>
      <ArrowDown className="h-6 w-6 text-muted-foreground/50" />
      <div className="grid w-full max-w-2xl grid-cols-2 gap-3">
        <div className="soft-card flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
          <Truck className="h-4 w-4 text-rose-700" /><span className="text-xs font-semibold text-rose-700">Vendor Eksternal</span>
        </div>
        <div className="soft-card flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <Boxes className="h-4 w-4 text-slate-700" /><span className="text-xs font-semibold text-slate-700">Warehouse</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab shell                                                            */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "journeys", label: "Role Journey", icon: Route },
  { id: "flow-complete", label: "Complete System Flow", icon: Workflow },
  { id: "wo", label: "Work Order Flow", icon: ClipboardList },
  { id: "req", label: "Request Flow", icon: Bell },
  { id: "proc", label: "Procurement Flow", icon: ShoppingCart },
  { id: "pm", label: "Preventive Flow", icon: CalendarClock },
  { id: "asset", label: "Asset Lifecycle", icon: Life },
  { id: "roles", label: "Role Permissions", icon: Table2 },
  { id: "data", label: "Data Flow", icon: GitBranch },
  { id: "faq", label: "FAQ", icon: HelpCircle },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span className="text-sm font-semibold text-foreground">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>}
    </div>
  );
}

export default function SystemGuide() {
  const [tab, setTab] = useState("overview");
  const navigate = useNavigate();
  const active = TABS.find((t) => t.id === tab);

  return (
    <div className="min-h-screen bg-background app-gradient">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <button onClick={() => navigate("/")} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition hover:bg-muted active:scale-[0.98]">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Login
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <Pill tone="primary" className="mb-3">System Guide</Pill>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground lg:text-4xl">
            Panduan Alur Sistem AITOMA CMMS
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
            Analisis mendalam & visualisasi interaktif tentang bagaimana setiap peran berinteraksi dengan platform — dari Super Admin hingga Operator lapangan.
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* TOC */}
          <nav className="lg:w-56 lg:shrink-0">
            <div className="soft-card sticky top-20 rounded-2xl border border-border/70 bg-card p-2 lg:p-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98] ${tab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <t.icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </nav>

          {/* Content */}
          <main className="min-w-0 flex-1">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div className="mb-5 flex items-center gap-2">
                {active && <active.icon className="h-5 w-5 text-primary" />}
                <h2 className="font-display text-xl font-bold text-foreground">{active?.label}</h2>
              </div>

              {tab === "overview" && (
                <div className="space-y-8">
                  <Card>
                    <p className="mb-6 text-sm text-muted-foreground">
                      AITOMA adalah platform multi-tenant: satu Super Admin mengelola banyak perusahaan klien, dan setiap klien memiliki hierarki peran sendiri untuk menjalankan operasional maintenance.
                    </p>
                    <ArchitectureDiagram />
                  </Card>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { role: "Super Admin", desc: "Kelola klien, subscription, revenue, support & system settings." },
                      { role: "Company Admin", desc: "Kelola perusahaan: user, asset, work order, inventory, procurement." },
                      { role: "Manager", desc: "Assign & approve work order, kelola teknisi, review request." },
                      { role: "Technician", desc: "Eksekusi work order lapangan, update status, gunakan part." },
                      { role: "Operator", desc: "Ajukan maintenance request, pantau status equipment." },
                      { role: "Vendor / Warehouse", desc: "Suplai spare part & kelola stok gudang." },
                    ].map((r) => (
                      <Card key={r.role} className="!p-4">
                        <RolePill role={r.role.split(" / ")[0]} />
                        <p className="mt-2 text-sm text-foreground">{r.desc}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {tab === "journeys" && <RoleJourney />}

              {tab === "flow-complete" && <CompleteSystemFlow />}

              {tab === "wo" && (
                <div>
                  <FlowDiagram steps={WORK_ORDER_FLOW} />
                  <FlowMeta
                    trigger="Kebutuhan perbaikan/pekerjaan muncul — manual, dari request operator, atau dari rencana preventive."
                    participants={["Manager", "Technician", "System", "Operator"]}
                    outcome="Pekerjaan terdokumentasi lengkap (waktu, biaya, part, foto) dan asset serta inventory ter-update otomatis."
                    example="Mesin CNC menunjukkan getaran tidak normal → manager buat WO Critical → teknisi Budi ditugaskan → mengganti bearing → part otomatis dikurangi dari stok → manager approve → WO ditutup."
                    tips={["Selalu lengkapi checklist sebelum menutup WO", "Dokumentasikan foto before/after untuk audit", "Gunakan SLA timer untuk prioritas Critical/High"]}
                    issues={["Part tidak tersedia saat WO berjalan — cek stok sebelum assign", "Lupa update status menyebabkan SLA breach"]}
                  />
                </div>
              )}

              {tab === "req" && (
                <div>
                  <FlowDiagram steps={REQUEST_FLOW} />
                  <FlowMeta
                    trigger="Operator lapangan menemukan masalah pada equipment yang mereka operasikan."
                    participants={["Operator", "Manager", "Technician"]}
                    outcome="Request tervalidasi dan diselesaikan melalui Work Order, dengan visibilitas penuh bagi operator."
                    example="Operator melaporkan kebocoran oli pada conveyor → manager review foto → approve & buat WO High Priority → teknisi memperbaiki → operator dapat notifikasi selesai."
                    tips={["Sertakan foto & lokasi detail saat submit request", "Manager sebaiknya review dalam waktu SLA yang ditentukan"]}
                    issues={["Request tanpa detail cukup memperlambat review", "Rejection tanpa alasan jelas membingungkan operator"]}
                  />
                </div>
              )}

              {tab === "proc" && (
                <div>
                  <FlowDiagram steps={PROCUREMENT_FLOW} />
                  <FlowMeta
                    trigger="Stok spare part menipis atau ada kebutuhan part khusus dari Work Order."
                    participants={["Technician", "Manager", "Vendor", "Warehouse"]}
                    outcome="Barang diterima, stok bertambah, dan pembayaran vendor terselesaikan dengan jejak audit lengkap."
                    example="Bearing spindle CNC menipis → manager buat PO ke vendor terpilih → vendor kirim quotation & barang → warehouse verifikasi & update stok → invoice dibayar → PO ditutup."
                    tips={["Bandingkan quotation dari minimal 2 vendor", "Verifikasi kondisi barang sebelum stock-in"]}
                    issues={["Keterlambatan konfirmasi vendor menghambat WO", "Selisih quantity saat penerimaan barang"]}
                  />
                </div>
              )}

              {tab === "pm" && (
                <div>
                  <FlowDiagram steps={PREVENTIVE_FLOW} />
                  <FlowMeta
                    trigger="Jadwal waktu (harian/bulanan) tercapai, atau trigger berbasis kondisi/usage terpenuhi."
                    participants={["Manager", "Technician", "System"]}
                    outcome="Downtime tak terduga berkurang, compliance PM terpantau, dan biaya maintenance lebih terprediksi."
                    example="Plan servis rutin genset setiap 3 bulan → sistem otomatis buat WO → teknisi menyelesaikan checklist servis → compliance rate naik ke 95%."
                    tips={["Tinjau efektivitas rasio planned vs unplanned tiap bulan", "Sesuaikan frekuensi jika asset sering breakdown di luar jadwal"]}
                    issues={["WO preventive menumpuk jika teknisi kurang", "Checklist generik tidak sesuai kondisi asset spesifik"]}
                  />
                </div>
              )}

              {tab === "asset" && (
                <div>
                  <FlowDiagram steps={ASSET_FLOW} />
                  <FlowMeta
                    trigger="Pengadaan asset baru hingga akhir masa pakainya."
                    participants={["Company Admin", "Manager", "Technician", "System"]}
                    outcome="Riwayat lengkap asset tersedia untuk keputusan investasi & penggantian yang tepat waktu."
                    example="Compressor dibeli 2019 → maintenance rutin tercatat 5 tahun → AI mendeteksi risiko kegagalan meningkat → manager rencanakan penggantian sebelum breakdown besar."
                    tips={["Lengkapi spesifikasi & dokumen asset sejak awal", "Manfaatkan skor kesehatan AI untuk prioritas investasi"]}
                    issues={["Data asset tidak lengkap menurunkan akurasi prediksi AI", "Retirement asset tanpa update status menyebabkan data usang"]}
                  />
                </div>
              )}

              {tab === "roles" && (
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/70">
                        <th className="sticky left-0 bg-card px-3 py-3 text-left font-display font-bold text-foreground">Fitur / Modul</th>
                        {ROLES.map((r) => (
                          <th key={r} className="px-3 py-3 text-center"><RolePill role={r} /></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PERMISSION_ROWS.map((row, i) => (
                        <tr key={row.feature} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                          <td className="sticky left-0 bg-inherit px-3 py-3 font-medium text-foreground">{row.feature}</td>
                          {ROLES.map((r) => (
                            <td key={r} className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">
                              {row.perms[r] === "-" ? <span className="text-border">—</span> : row.perms[r]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-4 text-xs text-muted-foreground">C = Create, R = Read, U = Update, D = Delete. Fitur juga dibatasi lebih lanjut oleh tier subscription (Starter/Professional/Enterprise).</p>
                </Card>
              )}

              {tab === "data" && (
                <div className="space-y-4">
                  <Card>
                    <p className="text-sm text-muted-foreground">Setiap modul saling terhubung — perubahan pada satu modul otomatis memicu update di modul lain dan notifikasi real-time.</p>
                  </Card>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {DATA_MODULES.map((m) => (
                      <Card key={m.name} className="!p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><m.icon className="h-4 w-4" /></div>
                          <h4 className="font-display text-sm font-bold text-foreground">{m.name}</h4>
                        </div>
                        <ul className="mt-3 space-y-1.5">
                          {m.links.map((l) => (
                            <li key={l} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-accent" /> {l}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {tab === "faq" && (
                <div className="space-y-2.5">
                  {FAQ.map((f) => <FaqItem key={f.q} {...f} />)}
                </div>
              )}
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}

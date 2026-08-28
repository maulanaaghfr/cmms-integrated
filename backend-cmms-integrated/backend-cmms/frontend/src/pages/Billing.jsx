import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Receipt,
  CreditCard,
  ShieldCheck,
  Sparkles,
  ArrowUpCircle,
  PackageOpen,
  Loader2,
  Clock,
  Users,
  HardDrive,
  MapPin,
  Zap,
  CalendarClock,
  RefreshCcw,
  AlertTriangle,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useApp, idr } from "../store/store";
import { PageHeader, Card, Table, Pill, Button, Reveal, Modal } from "../components/kit";
import {
  getSubscription,
  listInvoices,
  listPaymentChannels,
  createInvoicePayment,
  listPlans,
  changePlan,
} from "../lib/billing";

const FALLBACK_METHODS = [
  { code: "VC", label: "Kartu Kredit/Debit (Visa/Mastercard/JCB)", group: "Kartu" },
  { code: "BC", label: "BCA Virtual Account", group: "Virtual Account" },
  { code: "M2", label: "Mandiri Virtual Account", group: "Virtual Account" },
  { code: "I1", label: "BNI Virtual Account", group: "Virtual Account" },
  { code: "BR", label: "BRI Virtual Account (BRIVA)", group: "Virtual Account" },
];

// Dipakai hanya kalau GET /billing/plans belum ada / gagal — sesuaikan dengan katalog aslimu.
const FALLBACK_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    tagline: "Untuk tim kecil yang baru mulai",
    features: ["Asset & work order dasar", "1 lokasi", "Email support"],
  },
  {
    id: "professional",
    name: "Professional",
    price: 499000,
    tagline: "Untuk tim yang butuh maintenance terjadwal",
    popular: true,
    features: [
      "Semua fitur Starter",
      "Preventive maintenance schedules",
      "Procurement & inventory",
      "Hingga 5 lokasi",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 1499000,
    tagline: "Untuk operasi multi-lokasi skala besar",
    features: [
      "Semua fitur Professional",
      "AI Insights & analytics lanjutan",
      "Lokasi tanpa batas",
      "Prioritas support 24/7",
    ],
  },
];

const AUTO_REFRESH_MS = 20000; // billing state is money — keep it fresh without the user doing anything

/* ------------------------------- date/period helpers ------------------------------- */

function fmtDate(value, opts) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", opts || { day: "numeric", month: "long", year: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// "2 hari lagi" / "berakhir hari ini" / "3 hari yang lalu" — recomputed live so the
// billing page never shows a stale countdown while the tab stays open.
function relativeToNow(value) {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return { label: "hari ini", days: 0, past: false };
  if (diffDays > 0) return { label: `${diffDays} hari lagi`, days: diffDays, past: false };
  return { label: `${Math.abs(diffDays)} hari yang lalu`, days: diffDays, past: true };
}

function periodLabel(start, end) {
  if (!start || !end) return "-";
  return `${fmtDate(start, { day: "numeric", month: "short", year: "numeric" })} – ${fmtDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

const INVOICE_STATUS_META = {
  DRAFT: { label: "Draft", tone: "muted" },
  ISSUED: { label: "Menunggu pembayaran", tone: "warning" },
  PENDING: { label: "Diproses", tone: "warning" },
  PAID: { label: "Lunas", tone: "success" },
  OVERDUE: { label: "Jatuh tempo", tone: "danger" },
  FAILED: { label: "Gagal", tone: "danger" },
  VOID: { label: "Dibatalkan", tone: "muted" },
};

function invoiceStatusMeta(status) {
  return INVOICE_STATUS_META[status] || { label: status || "-", tone: "muted" };
}

const SUBSCRIPTION_STATUS_LABEL = {
  TRIAL: "Masa uji coba",
  ACTIVE: "Aktif",
  GRACE: "Masa tenggang",
  SUSPENDED: "Ditangguhkan",
  PENDING_PAYMENT: "Menunggu pembayaran",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Berakhir",
};

/* -------------------------------------------------------------------------- */

export default function Billing() {
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [channels, setChannels] = useState([]);
  const [pickerInvoice, setPickerInvoice] = useState(null);
  const [paying, setPaying] = useState(false);

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [changingPlanId, setChangingPlanId] = useState(null);
  const [billingCycle, setBillingCycle] = useState("MONTHLY");

  // Forces relative-time strings ("2 hari lagi", dsb.) to recompute while the tab is open.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [subRes, invRes] = await Promise.all([
        getSubscription().catch(() => null),
        listInvoices().catch(() => ({ data: [] })),
      ]);
      setSubscription(subRes?.data || null);
      setInvoices(invRes?.data || []);
    } catch (err) {
      if (!silent) toast.error(err.message || "Gagal memuat data billing.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime-ish: refresh quietly in the background so a plan pick or a payment
  // that just settled (webhook/callback) shows up without the user hitting reload.
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), AUTO_REFRESH_MS);
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const openPicker = async (invoice) => {
    setPickerInvoice(invoice);
    try {
      const res = await listPaymentChannels();
      setChannels(res.data || []);
    } catch {
      setChannels([]);
    }
  };

  const handlePay = async (channel) => {
    if (!pickerInvoice) return;
    setPickerInvoice(null);
    setPaying(true);
    try {
      const idempotencyKey = `${pickerInvoice.id}-${channel.id}-${Date.now()}`;
      const res = await createInvoicePayment(pickerInvoice.id, { payment_channel_id: channel.id, idempotency_key: idempotencyKey });
      if (res?.data?.redirect_url) {
        window.location.href = res.data.redirect_url;
      } else {
        toast.success("Pembayaran diproses. Status akan diperbarui otomatis setelah selesai.");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Gagal membuat pembayaran.");
    } finally {
      setPaying(false);
    }
  };

  const openPlanPicker = useCallback(async () => {
    setPlanModalOpen(true);
    setPlansLoading(true);
    try {
      const res = await listPlans();
      setPlans(res?.data?.length ? res.data : FALLBACK_PLANS);
    } catch {
      setPlans(FALLBACK_PLANS);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  // Kalau datang dari link "Upgrade" di trial banner (/billing?upgrade=1),
  // langsung buka modal pilih paket tanpa perlu klik lagi.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("upgrade") === "1") {
      openPlanPicker();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangePlan = async (plan) => {
    if (plan.id === subscription?.plan?.id || changingPlanId) return;
    setChangingPlanId(plan.id);
    try {
      const res = await changePlan(plan.id, billingCycle);
      const payload = res?.data;
      if (payload?.redirect_url) {
        window.location.href = payload.redirect_url;
        return;
      }
      setPlanModalOpen(false);
      await load();
      if (payload?.invoice_id) {
        // Paid plan: it's only "picked", not active yet — send them straight
        // to pay so the flow doesn't dead-end on a silent success toast.
        toast.info(`Paket ${plan.name} dipilih. Selesaikan pembayaran agar paket aktif.`);
        try {
          const invRes = await listInvoices();
          const invoice = (invRes?.data || []).find((i) => i.id === payload.invoice_id);
          if (invoice) await openPicker(invoice);
        } catch {
          // non-fatal — the invoice still shows up in billing history with a "Bayar" button
        }
      } else {
        toast.success(`Paket ${plan.name} aktif sekarang.`);
      }
    } catch (err) {
      toast.error(err.message || "Gagal memilih paket. Coba lagi.");
    } finally {
      setChangingPlanId(null);
    }
  };

  const hasActivePlan = !!subscription?.plan?.name;
  const planName = subscription?.plan?.name || "";
  const planPrice = subscription?.price_snapshot || 0;
  const subStatus = subscription?.status || "";
  const pending = subscription?.pending || null;

  const periodEndInfo = useMemo(() => relativeToNow(subscription?.current_period_end), [subscription?.current_period_end]);
  const isTrial = subStatus === "TRIAL";
  const isGrace = subStatus === "GRACE";
  const isSuspended = subStatus === "SUSPENDED";

  const displayChannels = channels.length > 0 ? channels : FALLBACK_METHODS;
  const displayPlans = plans.length > 0 ? plans : FALLBACK_PLANS;

  const payPendingInvoice = async () => {
    if (!pending?.invoice) return;
    try {
      const invRes = await listInvoices();
      const invoice = (invRes?.data || []).find((i) => i.id === pending.invoice.id) || { id: pending.invoice.id };
      await openPicker(invoice);
    } catch {
      await openPicker({ id: pending.invoice.id });
    }
  };

  const columns = [
    { key: "invoice_number", header: "No. Invoice", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.invoice_number || r.id}</span> },
    {
      key: "period",
      header: "Periode",
      render: (r) => (
        <span className="text-xs text-foreground">
          {r.billing_period_start ? periodLabel(r.billing_period_start, r.billing_period_end) : "-"}
        </span>
      ),
    },
    { key: "amount", header: "Jumlah", render: (r) => <span className="font-semibold tabular-nums">{idr(r.amount || r.total_amount || 0)}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const meta = invoiceStatusMeta(r.status);
        return <Pill tone={meta.tone}>{meta.label}</Pill>;
      },
    },
    {
      key: "due",
      header: "Jatuh tempo",
      render: (r) => {
        if (r.status === "PAID") {
          return <span className="text-xs text-muted-foreground">Dibayar {fmtDate(r.paid_at)}</span>;
        }
        if (!r.due_at) return <span className="text-xs text-muted-foreground">-</span>;
        const rel = relativeToNow(r.due_at);
        return (
          <span className={`text-xs ${rel?.past ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
            {fmtDate(r.due_at, { day: "numeric", month: "short" })}
            {rel ? ` · ${rel.label}` : ""}
          </span>
        );
      },
    },
    {
      key: "act",
      header: "",
      render: (r) => ["ISSUED", "PENDING", "OVERDUE"].includes(r.status) && (
        <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={paying} onClick={() => openPicker(r)}>
          Bayar
        </Button>
      ),
    },
  ];

  return (
    <Reveal>
      <PageHeader
        title="Billing & Subscription"
        subtitle={`Manage your plan, invoices, and payment methods for ${user?.company || "your organization"}.`}
        action={
          <button
            type="button"
            onClick={() => load({ silent: true })}
            title="Segarkan status billing"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50"
            disabled={refreshing}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Menyegarkan…" : "Segarkan"}
          </button>
        }
      />

      {loading ? (
        <div className="mb-6 h-32 animate-pulse rounded-2xl bg-muted" />
      ) : hasActivePlan ? (
        <Card className="mb-5 overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-accent/[0.06] p-0">
          <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Active package
                  <Pill tone={isSuspended ? "danger" : isGrace ? "warning" : isTrial ? "warning" : "success"} className="!py-0.5">
                    {SUBSCRIPTION_STATUS_LABEL[subStatus] || subStatus}
                  </Pill>
                </div>
                <div className="font-display text-2xl font-extrabold text-foreground">{planName}</div>
                {subscription?.current_period_end && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Berlaku hingga <span className="font-semibold text-foreground">{fmtDate(subscription.current_period_end)}</span>
                    {periodEndInfo && (
                      <span className={periodEndInfo.past ? "font-semibold text-destructive" : periodEndInfo.days <= 5 ? "font-semibold text-[hsl(var(--warning))]" : ""}>
                        ({periodEndInfo.label})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-display text-2xl font-extrabold text-primary">{idr(planPrice)}</div>
                <div className="text-xs text-muted-foreground">
                  per {subscription?.billing_period === "YEARLY" ? "tahun" : "bulan"} · auto-renew {subscription?.auto_renew ? "aktif" : "nonaktif"}
                </div>
              </div>
              <button
                type="button"
                onClick={openPlanPicker}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 active:scale-[0.97]"
              >
                <ArrowUpCircle className="h-4 w-4" /> Upgrade
              </button>
            </div>
          </div>
          <div className="grid border-t border-primary/10 sm:grid-cols-3">
            <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground"><Check className="h-4 w-4 text-[hsl(var(--success))]" />Asset & work order management</div>
            <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground"><Check className="h-4 w-4 text-[hsl(var(--success))]" />Preventive maintenance schedules</div>
            <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Secure tenant workspace</div>
          </div>
        </Card>
      ) : (
        <Card className="mb-5 overflow-hidden border-dashed border-muted-foreground/30 bg-muted/20 p-0">
          <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <PackageOpen className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Active package</div>
                <div className="font-display text-xl font-extrabold text-foreground">Belum ada paket aktif</div>
                <p className="mt-1 text-xs text-muted-foreground">Pilih paket untuk mengaktifkan fitur penuh CMMS untuk {user?.company || "organisasi Anda"}.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={openPlanPicker}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 active:scale-[0.97]"
            >
              <Sparkles className="h-4 w-4" /> Pilih Paket
            </button>
          </div>
        </Card>
      )}

      {/* Pending payment: a plan was picked but isn't active — never implied by the card above. */}
      {!loading && pending && (
        <Card className="mb-5 overflow-hidden border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/[0.06] p-0">
          <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--warning))]">
                  <AlertTriangle className="h-3.5 w-3.5" /> Menunggu pembayaran
                </div>
                <div className="font-display text-lg font-bold text-foreground">
                  {pending.plan?.name || "Paket baru"} — {idr(pending.price_snapshot)}
                  <span className="text-xs font-medium text-muted-foreground"> /{pending.billing_period === "YEARLY" ? "tahun" : "bulan"}</span>
                </div>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  Paket ini <b>belum aktif</b>. Dipilih pada {fmtDateTime(pending.selected_at)} — fitur akan otomatis aktif segera setelah pembayaran dikonfirmasi.
                  {hasActivePlan && <> Paket <b>{planName}</b> saat ini tetap berjalan sampai pembayaran ini selesai.</>}
                </p>
                {pending.invoice?.due_at && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Bayar sebelum {fmtDate(pending.invoice.due_at)}
                    {(() => {
                      const rel = relativeToNow(pending.invoice.due_at);
                      return rel ? <span className={rel.past ? "font-semibold text-destructive" : ""}> ({rel.label})</span> : null;
                    })()}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={payPendingInvoice}
              disabled={paying || !pending.invoice}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[hsl(var(--warning))] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[hsl(var(--warning))]/25 transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CreditCard className="h-4 w-4" /> Bayar Sekarang
            </button>
          </div>
        </Card>
      )}

      <Card className="p-3.5 lg:p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground"><Receipt className="h-4 w-4 text-primary" /> Billing history</h3>
            <p className="mt-1 text-xs text-muted-foreground">Invoices, payment status, and billing period for each cycle</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-4 w-4" /></span>
        </div>
        <Table columns={columns} rows={invoices} empty={loading ? "Memuat..." : "Belum ada riwayat tagihan."} />
      </Card>

      <Modal open={!!pickerInvoice} onClose={() => setPickerInvoice(null)} title="Pilih Metode Pembayaran">
        <div className="space-y-2">
          {displayChannels.map((ch) => (
            <button
              key={ch.id || ch.code}
              type="button"
              onClick={() => handlePay(ch)}
              className="w-full rounded-xl border px-3 py-2.5 text-left text-sm text-foreground transition hover:border-primary hover:bg-primary/5"
            >
              {ch.name || ch.label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={planModalOpen} onClose={() => !changingPlanId && setPlanModalOpen(false)} title="Pilih atau Ubah Paket" wide>
        {plansLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : (
          <>
            {displayPlans.some((p) => p.annual_price) && (
              <div className="mb-4 flex items-center justify-center">
                <div className="inline-flex rounded-full border bg-muted/40 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBillingCycle("MONTHLY")}
                    className={`rounded-full px-3.5 py-1.5 transition ${billingCycle === "MONTHLY" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle("YEARLY")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${billingCycle === "YEARLY" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Tahunan <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${billingCycle === "YEARLY" ? "bg-white/20" : "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"}`}>Hemat</span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              {displayPlans.map((plan) => {
                const isCurrent = plan.id === subscription?.plan?.id;
                const isPendingPlan = pending?.plan?.id === plan.id;
                const isChanging = changingPlanId === plan.id;
                const disabled = isCurrent || !!changingPlanId;
                const showAnnual = billingCycle === "YEARLY" && plan.annual_price;
                const displayPrice = showAnnual ? plan.annual_price : plan.price;
                const monthlyEquivalent = showAnnual && plan.price ? Math.round(plan.annual_price / 12) : null;

                return (
                  <div
                    key={plan.id}
                    className={[
                      "relative flex flex-col rounded-2xl border-2 p-4 transition-all",
                      plan.popular && !isCurrent ? "border-primary shadow-lg shadow-primary/10" : "border-border",
                      isCurrent ? "border-primary/40 bg-primary/[0.04]" : isPendingPlan ? "border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/[0.05]" : "bg-card",
                    ].join(" ")}
                  >
                    {plan.popular && !isCurrent && !isPendingPlan && (
                      <span className="absolute -top-3 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow">
                        Paling Populer
                      </span>
                    )}
                    {isPendingPlan && (
                      <span className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--warning))] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                        <Clock className="h-2.5 w-2.5" /> Menunggu Bayar
                      </span>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="font-display text-base font-bold text-foreground">{plan.name}</span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--success))]/15 px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--success))]">
                          <BadgeCheck className="h-3 w-3" /> Aktif
                        </span>
                      )}
                    </div>
                    <p className="mt-1 min-h-[2rem] text-xs text-muted-foreground">{plan.tagline}</p>

                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="font-display text-2xl font-extrabold text-primary">
                        {displayPrice ? idr(displayPrice) : "Gratis"}
                      </span>
                      {displayPrice ? <span className="text-xs font-medium text-muted-foreground">/{showAnnual ? "tahun" : "bulan"}</span> : null}
                    </div>
                    {monthlyEquivalent ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">setara {idr(monthlyEquivalent)}/bulan</p>
                    ) : null}

                    {(plan.max_users || plan.max_assets || plan.max_sites) && (
                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-y py-2 text-[11px] text-muted-foreground">
                        {plan.max_users && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {plan.max_users} pengguna</span>}
                        {plan.max_assets && <span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3" /> {plan.max_assets} aset</span>}
                        {plan.max_sites && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {plan.max_sites} lokasi</span>}
                      </div>
                    )}

                    <ul className="mt-4 flex-1 space-y-2">
                      {(plan.features || []).map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleChangePlan(plan)}
                      className={[
                        "mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition active:scale-[0.97]",
                        isCurrent
                          ? "cursor-not-allowed bg-muted text-muted-foreground"
                          : disabled
                          ? "cursor-not-allowed bg-primary/50 text-primary-foreground"
                          : "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-110",
                      ].join(" ")}
                    >
                      {isChanging ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memproses...</>
                      ) : isCurrent ? (
                        "Paket Saat Ini"
                      ) : displayPrice ? (
                        <><Zap className="h-3.5 w-3.5" /> {isPendingPlan ? "Buat Ulang Tagihan" : "Pilih Paket"}</>
                      ) : (
                        "Pilih Paket"
                      )}
                    </button>
                    {!isCurrent && displayPrice > 0 && (
                      <p className="mt-2 text-center text-[10px] text-muted-foreground">Paket aktif otomatis setelah pembayaran berhasil</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Modal>
    </Reveal>
  );
}

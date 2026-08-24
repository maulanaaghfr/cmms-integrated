import React, { useCallback, useEffect, useState } from "react";
import { Check, Receipt, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp, idr } from "../store/store";
import { PageHeader, Card, Table, Pill, Button, Reveal, statusTone, Modal } from "../components/kit";
import { getSubscription, listInvoices, listPaymentChannels, createInvoicePayment } from "../lib/billing";

const FALLBACK_METHODS = [
  { code: "VC", label: "Kartu Kredit/Debit (Visa/Mastercard/JCB)", group: "Kartu" },
  { code: "BC", label: "BCA Virtual Account", group: "Virtual Account" },
  { code: "M2", label: "Mandiri Virtual Account", group: "Virtual Account" },
  { code: "I1", label: "BNI Virtual Account", group: "Virtual Account" },
  { code: "BR", label: "BRI Virtual Account (BRIVA)", group: "Virtual Account" },
];

export default function Billing() {
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [channels, setChannels] = useState([]);
  const [pickerInvoice, setPickerInvoice] = useState(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, invRes] = await Promise.all([
        getSubscription().catch(() => null),
        listInvoices().catch(() => ({ data: [] })),
      ]);
      setSubscription(subRes?.data || null);
      setInvoices(invRes?.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data billing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPicker = async (invoice) => {
    setPickerInvoice(invoice);
    try {
      const res = await listPaymentChannels();
      setChannels(res.data || []);
    } catch {
      setChannels([]);
    }
  };

  const handlePay = async (channelCode) => {
    if (!pickerInvoice) return;
    setPickerInvoice(null);
    setPaying(true);
    try {
      const res = await createInvoicePayment(pickerInvoice.id, { payment_channel_code: channelCode });
      if (res?.data?.payment_url) {
        window.location.href = res.data.payment_url;
      } else {
        toast.success("Pembayaran diproses.");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Gagal membuat pembayaran.");
    } finally {
      setPaying(false);
    }
  };

  const planName = subscription?.plan?.name || "-";
  const planPrice = subscription?.price_snapshot || 0;
  const subStatus = subscription?.status || "-";

  const displayChannels = channels.length > 0 ? channels : FALLBACK_METHODS;

  const columns = [
    { key: "invoice_number", header: "No. Invoice", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.invoice_number || r.id}</span> },
    { key: "period", header: "Periode", render: (r) => r.period_start ? `${new Date(r.period_start).toLocaleDateString("id-ID")} – ${new Date(r.period_end).toLocaleDateString("id-ID")}` : "-" },
    { key: "amount", header: "Jumlah", render: (r) => <span className="font-semibold tabular-nums">{idr(r.amount || r.total_amount || 0)}</span> },
    { key: "status", header: "Status", render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill> },
    {
      key: "act", header: "", render: (r) => r.status === "UNPAID" && (
        <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={paying} onClick={() => openPicker(r)}>
          Bayar
        </Button>
      ),
    },
  ];

  return (
    <Reveal>
      <PageHeader title="Billing & Subscription" subtitle={`Manage your plan, invoices, and payment methods for ${user?.company || "your organization"}.`} />

      {loading ? (
        <div className="mb-6 h-32 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <Card className="mb-5 overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-accent/[0.06] p-0">
          <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Active package</div>
                <div className="font-display text-2xl font-extrabold text-foreground">{planName}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-extrabold text-primary">{idr(planPrice)}</div>
              <div className="text-xs text-muted-foreground">per bulan · Status: {subStatus}</div>
            </div>
          </div><div className="grid border-t border-primary/10 sm:grid-cols-3"><div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground"><Check className="h-4 w-4 text-[hsl(var(--success))]" />Asset & work order management</div><div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground"><Check className="h-4 w-4 text-[hsl(var(--success))]" />Preventive maintenance schedules</div><div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Secure tenant workspace</div></div>
        </Card>
      )}

      <Card className="p-3.5 lg:p-4">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground"><Receipt className="h-4 w-4 text-primary" /> Billing history</h3><p className="mt-1 text-xs text-muted-foreground">Invoices and payment status</p></div><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-4 w-4" /></span></div>
        <Table columns={columns} rows={invoices} empty={loading ? "Memuat..." : "Belum ada riwayat tagihan."} />
      </Card>

      <Modal open={!!pickerInvoice} onClose={() => setPickerInvoice(null)} title="Pilih Metode Pembayaran">
        <div className="space-y-2">
          {displayChannels.map((ch) => (
            <button
              key={ch.code}
              onClick={() => handlePay(ch.code)}
              className="w-full rounded-xl border px-3 py-2.5 text-left text-sm text-foreground transition hover:border-primary hover:bg-primary/5"
            >
              {ch.name || ch.label}
            </button>
          ))}
        </div>
      </Modal>
    </Reveal>
  );
}

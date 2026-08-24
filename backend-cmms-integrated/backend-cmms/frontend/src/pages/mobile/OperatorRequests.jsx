import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, ChevronRight, X } from "lucide-react";
import { useApp } from "../../store/store";
import { Sheet, PhotoCapture } from "../../components/mobile-kit";
import { listRequests, createRequest } from "../../lib/requests";
import { listAssets } from "../../lib/assets";

const PRIORITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const statusTone = {
  SUBMITTED: "bg-muted text-muted-foreground",
  PENDING_APPROVAL: "bg-primary/10 text-primary",
  APPROVED: "bg-accent/10 text-accent",
  IN_PROGRESS: "bg-accent/10 text-accent",
  CONVERTED: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export default function OperatorRequests() {
  const { user } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ asset_id: "", title: "", description: "", priority: "MEDIUM" });
  const [requests, setRequests] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, assetsRes] = await Promise.all([listRequests(), listAssets()]);
      setRequests(reqRes.data || []);
      setAssets(assetsRes.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.title.trim() || !form.asset_id) {
      toast.error("Deskripsi & peralatan wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await createRequest({
        asset_id: form.asset_id,
        title: form.title.trim(),
        description: form.description || form.title.trim(),
        priority: form.priority,
      });
      toast.success("Permintaan terkirim!");
      setForm({ asset_id: "", title: "", description: "", priority: "MEDIUM" });
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal mengirim permintaan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold text-foreground">Permintaan Saya</h1>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> Baru
        </button>
      </div>

      <div className="space-y-2.5">
        {loading && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Memuat...</div>}
        {!loading && requests.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Belum ada permintaan.</div>
        )}
        {requests.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4 soft-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{r.title}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[r.status] || "bg-muted text-muted-foreground"}`}>{r.status}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{r.request_number} · {r.priority}</span>
            </div>
          </div>
        ))}
      </div>

      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title="Ajukan Permintaan Maintenance">
        <div className="space-y-3">
          <Field label="Deskripsi Masalah">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="mis. Mesin berbunyi tidak normal"
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <Field label="Peralatan">
            <select
              value={form.asset_id}
              onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Pilih peralatan...</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Tingkat Urgensi">
            <div className="flex gap-2">
              {PRIORITY.map((p) => (
                <button
                  key={p}
                  onClick={() => setForm({ ...form, priority: p })}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${form.priority === p ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Detail Tambahan">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setFormOpen(false)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border bg-background py-2.5 text-sm font-semibold text-muted-foreground"
            >
              <X className="h-4 w-4" /> Batal
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Mengirim..." : "Kirim Permintaan"}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

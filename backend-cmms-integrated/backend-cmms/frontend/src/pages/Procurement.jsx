import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Star, Truck, FileText, CheckCircle2, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store/store";
import {
  PageHeader, Card, Table, Pill, Button, IconButton, SearchInput, StatCard, Tabs,
  Modal, ConfirmDialog, Field, Input, Select, Textarea, Reveal, statusTone,
} from "../components/kit";
import {
  listVendors, createVendor, updateVendor, archiveVendor,
  listPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, receivePurchaseOrder, archivePurchaseOrder,
} from "../lib/procurement";
import { listSpareParts, listWarehouses } from "../lib/inventory";

const PO_STATUSES = ["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "INVOICED", "PAID", "CANCELLED"];
const PO_STATUS_LABEL = {
  DRAFT: "Draft", SENT: "Sent", CONFIRMED: "Confirmed",
  PARTIALLY_RECEIVED: "Partially Received", RECEIVED: "Received",
  INVOICED: "Invoiced", PAID: "Paid", CANCELLED: "Cancelled",
};
const VENDOR_TYPES = ["Sparepart Supplier", "Contractor", "Service Provider"];
const idr = (n) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n || 0));

const blankVendor = {
  name: "", vendor_type: "Sparepart Supplier", contact_person: "", email: "",
  phone: "", address: "", city: "", country: "Indonesia", website: "",
  rating: 4, on_time_rate: 80, quality_rate: 80, price_score: 70,
};

export default function Procurement() {
  const { user } = useApp();
  const canEdit = ["company_admin", "manager"].includes(user?.role);

  const [tab, setTab] = useState("po");
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [q, setQ] = useState("");
  const [vendorForm, setVendorForm] = useState(null);
  const [poForm, setPoForm] = useState(null);
  const [poDetail, setPoDetail] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [del, setDel] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vendorsRes, poRes, partsRes, warehousesRes] = await Promise.all([
        listVendors(),
        listPurchaseOrders(),
        listSpareParts({ per_page: 200 }),
        listWarehouses(),
      ]);
      setVendors(vendorsRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setSpareParts(partsRes.data || []);
      setWarehouses(warehousesRes.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data procurement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const spend = purchaseOrders.reduce((s, p) => s + Number(p.total_cost || 0), 0);
    const open = purchaseOrders.filter((p) => !["RECEIVED", "INVOICED", "PAID", "CANCELLED"].includes(p.status)).length;
    const avgRating = vendors.length
      ? (vendors.reduce((s, v) => s + Number(v.rating || 0), 0) / vendors.length).toFixed(1)
      : "0.0";
    return { spend, open, avgRating };
  }, [purchaseOrders, vendors]);

  const vendorRows = useMemo(() =>
    vendors.filter((v) =>
      (v.name || "").toLowerCase().includes(q.toLowerCase()) ||
      (v.city || "").toLowerCase().includes(q.toLowerCase())
    ), [vendors, q]);

  const poRows = useMemo(() =>
    purchaseOrders.filter((p) =>
      (p.po_number || "").toLowerCase().includes(q.toLowerCase()) ||
      (p.vendor_name || "").toLowerCase().includes(q.toLowerCase())
    ), [purchaseOrders, q]);

  /* ---- Vendor CRUD ---- */
  const saveVendor = async () => {
    if (!vendorForm.name?.trim()) { toast.error("Nama vendor wajib diisi."); return; }
    setSaving(true);
    const payload = {
      name: vendorForm.name.trim(),
      vendor_type: vendorForm.vendor_type || "Sparepart Supplier",
      contact_person: vendorForm.contact_person || null,
      email: vendorForm.email || null,
      phone: vendorForm.phone || null,
      address: vendorForm.address || null,
      city: vendorForm.city || null,
      country: vendorForm.country || "Indonesia",
      website: vendorForm.website || null,
      rating: Number(vendorForm.rating) || 4,
      on_time_rate: Number(vendorForm.on_time_rate) || 80,
      quality_rate: Number(vendorForm.quality_rate) || 80,
      price_score: Number(vendorForm.price_score) || 70,
    };
    try {
      if (vendorForm.id) {
        await updateVendor(vendorForm.id, payload);
        toast.success("Vendor diperbarui.");
      } else {
        await createVendor(payload);
        toast.success("Vendor ditambahkan.");
      }
      setVendorForm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan vendor.");
    } finally {
      setSaving(false);
    }
  };

  /* ---- PO CRUD ---- */
  const blankPO = () => ({
    vendor_id: vendors[0]?.id || "",
    status: "DRAFT",
    invoice_status: "PENDING",
    expected_date: "",
    notes: "",
    items: [{ spare_part_id: "", part_name: "", quantity: 1, unit_price: 0 }],
  });

  const savePO = async () => {
    if (!poForm.vendor_id) { toast.error("Pilih vendor."); return; }
    if (!poForm.items?.length || !poForm.items[0].part_name?.trim()) {
      toast.error("Minimal satu item harus diisi."); return;
    }
    setSaving(true);
    const payload = {
      vendor_id: poForm.vendor_id,
      status: poForm.status || "DRAFT",
      invoice_status: poForm.invoice_status || "PENDING",
      expected_date: poForm.expected_date || null,
      notes: poForm.notes || null,
      items: poForm.items
        .filter((it) => it.part_name?.trim())
        .map((it) => ({
          spare_part_id: it.spare_part_id || null,
          part_name: it.part_name.trim(),
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
        })),
    };
    try {
      if (poForm.id) {
        await updatePurchaseOrder(poForm.id, payload);
        toast.success("Purchase order diperbarui.");
      } else {
        await createPurchaseOrder(payload);
        toast.success("Purchase order dibuat.");
      }
      setPoForm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan purchase order.");
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (po) => {
    const idx = PO_STATUSES.indexOf(po.status);
    if (idx < 0 || idx >= PO_STATUSES.length - 1) return;
    const nextStatus = PO_STATUSES[idx + 1];
    if (nextStatus === "RECEIVED") {
      if (!warehouses.length) return toast.error("Buat gudang terlebih dahulu sebelum menerima purchase order.");
      return setReceipt({ po, warehouse_id: warehouses[0].id });
    }
    try {
      await updatePurchaseOrder(po.id, {
        status: nextStatus,
      });
      toast.success(`${po.po_number} → ${PO_STATUS_LABEL[nextStatus]}`);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal memperbarui status.");
    }
  };

  const confirmReceipt = async () => {
    if (!receipt?.warehouse_id) return toast.error("Pilih gudang penerimaan.");
    setSaving(true);
    try {
      await receivePurchaseOrder(receipt.po.id, { warehouse_id: receipt.warehouse_id });
      toast.success(`${receipt.po.po_number} diterima dan stok telah ditambahkan.`);
      setReceipt(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menerima purchase order.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDel = async () => {
    try {
      if (del.coll === "vendors") {
        await archiveVendor(del.id);
      } else {
        await archivePurchaseOrder(del.id);
      }
      toast.success("Dihapus.");
      setDel(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menghapus.");
    }
  };

  const vendorColumns = [
    {
      key: "name", header: "Vendor", render: (v) => (
        <div>
          <div className="font-semibold">{v.name}</div>
          <div className="text-xs text-muted-foreground">{v.vendor_type} · {v.city || "-"}</div>
        </div>
      ),
    },
    {
      key: "contact", header: "Kontak", render: (v) => (
        <div className="text-xs">
          <div>{v.contact_person || "-"}</div>
          <div className="text-muted-foreground">{v.email || "-"}</div>
        </div>
      ),
    },
    {
      key: "rating", header: "Rating", render: (v) => (
        <span className="flex items-center gap-1 font-semibold">
          <Star className="h-3.5 w-3.5 fill-[hsl(var(--warning))] text-[hsl(var(--warning))]" />
          {Number(v.rating).toFixed(1)}
        </span>
      ),
    },
    { key: "on_time_rate", header: "On-time", render: (v) => `${v.on_time_rate}%` },
    { key: "total_spend", header: "Total Belanja", render: (v) => idr(v.total_spend) },
    {
      key: "act", header: "", render: (v) => canEdit && (
        <div className="flex justify-end gap-1.5">
          <IconButton onClick={(e) => { e.stopPropagation(); setVendorForm({ ...blankVendor, ...v }); }}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton onClick={(e) => { e.stopPropagation(); setDel({ coll: "vendors", id: v.id, label: v.name }); }} className="hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  const poColumns = [
    { key: "po_number", header: "PO", render: (p) => <span className="font-mono text-xs text-muted-foreground">{p.po_number}</span> },
    { key: "vendor_name", header: "Vendor", render: (p) => p.vendor_name || "-" },
    {
      key: "items", header: "Items", render: (p) => (
        <span className="text-xs">{(p.items || []).length} item · {(p.items || []).map((i) => i.part_name).join(", ")}</span>
      ),
    },
    { key: "total_cost", header: "Total", render: (p) => idr(p.total_cost) },
    { key: "status", header: "Status", render: (p) => <Pill tone={statusTone(PO_STATUS_LABEL[p.status] || p.status)}>{PO_STATUS_LABEL[p.status] || p.status}</Pill> },
    {
      key: "act", header: "", render: (p) => canEdit && (
        <div className="flex justify-end gap-1.5">
          {p.status !== "PAID" && p.status !== "CANCELLED" && (
            <IconButton onClick={(e) => { e.stopPropagation(); advanceStatus(p); }} title="Lanjutkan status">
              <CheckCircle2 className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton onClick={(e) => { e.stopPropagation(); setPoForm({ ...p, items: p.items || [] }); }}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton onClick={(e) => { e.stopPropagation(); setDel({ coll: "purchaseOrders", id: p.id, label: p.po_number }); }} className="hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <Reveal>
      <PageHeader
        title="Vendor & Purchase Order"
        subtitle="Kelola vendor, quotation, dan siklus pembelian sparepart."
        action={canEdit && (
          tab === "po"
            ? <Button onClick={() => setPoForm(blankPO())}><Plus className="h-4 w-4" /> Buat PO</Button>
            : <Button onClick={() => setVendorForm({ ...blankVendor })}><Plus className="h-4 w-4" /> Tambah Vendor</Button>
        )}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Truck} label="Total Belanja" value={idr(totals.spend)} tone="primary" />
        <StatCard icon={FileText} label="PO Belum Selesai" value={totals.open} tone="warning" />
        <StatCard icon={Star} label="Rating Vendor Rata-rata" value={totals.avgRating} tone="success" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[{ key: "po", label: "Purchase Orders" }, { key: "vendors", label: "Vendors" }]}
          active={tab} onChange={setTab}
        />
        <SearchInput value={q} onChange={setQ} placeholder={tab === "po" ? "Cari PO / vendor..." : "Cari vendor / kota..."} />
      </div>

      <Card>
        {tab === "po"
          ? <Table columns={poColumns} rows={poRows} onRowClick={(p) => setPoDetail(p)} empty={loading ? "Memuat..." : "Belum ada purchase order."} />
          : <Table columns={vendorColumns} rows={vendorRows} empty={loading ? "Memuat..." : "Belum ada vendor."} />
        }
      </Card>

      {/* Vendor Form */}
      <Modal
        open={!!vendorForm} onClose={() => setVendorForm(null)}
        title={vendorForm?.id ? "Edit Vendor" : "Tambah Vendor"} wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setVendorForm(null)}>Batal</Button>
            <Button onClick={saveVendor} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {vendorForm && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama Vendor" required>
              <Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
            </Field>
            <Field label="Tipe">
              <Select value={vendorForm.vendor_type} onChange={(e) => setVendorForm({ ...vendorForm, vendor_type: e.target.value })}>
                {VENDOR_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Kontak Person">
              <Input value={vendorForm.contact_person || ""} onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={vendorForm.email || ""} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <Input value={vendorForm.phone || ""} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} />
            </Field>
            <Field label="Kota">
              <Input value={vendorForm.city || ""} onChange={(e) => setVendorForm({ ...vendorForm, city: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Alamat">
                <Input value={vendorForm.address || ""} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} />
              </Field>
            </div>
            <Field label="Rating (1-5)">
              <Input type="number" min="1" max="5" step="0.1" value={vendorForm.rating} onChange={(e) => setVendorForm({ ...vendorForm, rating: e.target.value })} />
            </Field>
            <Field label="On-time Delivery (%)">
              <Input type="number" min="0" max="100" value={vendorForm.on_time_rate} onChange={(e) => setVendorForm({ ...vendorForm, on_time_rate: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* PO Form */}
      <Modal
        open={!!poForm} onClose={() => setPoForm(null)}
        title={poForm?.id ? `Edit ${poForm.po_number || "PO"}` : "Buat Purchase Order"} wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setPoForm(null)}>Batal</Button>
            <Button onClick={savePO} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {poForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Vendor" required>
                <Select value={poForm.vendor_id} onChange={(e) => setPoForm({ ...poForm, vendor_id: e.target.value })}>
                  <option value="">Pilih vendor...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={poForm.status} onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}>
                  {PO_STATUSES.map((s) => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}
                </Select>
              </Field>
              <Field label="Tanggal Dibutuhkan">
                <Input type="date" value={poForm.expected_date || ""} onChange={(e) => setPoForm({ ...poForm, expected_date: e.target.value })} />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Item Sparepart</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary"
                  onClick={() => setPoForm({ ...poForm, items: [...(poForm.items || []), { spare_part_id: "", part_name: "", quantity: 1, unit_price: 0 }] })}
                >
                  + Tambah Item
                </button>
              </div>
              <div className="space-y-2">
                {(poForm.items || []).map((it, i) => (
                  <div key={i} className="grid grid-cols-6 gap-2">
                    <Select
                      className="col-span-3"
                      value={it.spare_part_id || ""}
                      onChange={(e) => {
                        const part = spareParts.find((p) => p.id === e.target.value);
                        const items = (poForm.items || []).map((x, idx) =>
                          idx === i ? { ...x, spare_part_id: e.target.value, part_name: part?.name || x.part_name, unit_price: part?.unit_cost || x.unit_price } : x
                        );
                        setPoForm({ ...poForm, items });
                      }}
                    >
                      <option value="">Pilih part / ketik manual...</option>
                      {spareParts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                    <Input
                      className="col-span-1"
                      placeholder="Nama"
                      value={it.part_name}
                      onChange={(e) => setPoForm({ ...poForm, items: (poForm.items || []).map((x, idx) => idx === i ? { ...x, part_name: e.target.value } : x) })}
                    />
                    <Input
                      type="number" min="1" className="col-span-1"
                      value={it.quantity}
                      onChange={(e) => setPoForm({ ...poForm, items: (poForm.items || []).map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x) })}
                    />
                    <Input
                      type="number" min="0" className="col-span-1"
                      value={it.unit_price}
                      onChange={(e) => setPoForm({ ...poForm, items: (poForm.items || []).map((x, idx) => idx === i ? { ...x, unit_price: e.target.value } : x) })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Field label="Catatan">
              <Textarea rows={2} value={poForm.notes || ""} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* PO Detail */}
      <Modal open={!!poDetail} onClose={() => setPoDetail(null)} wide title={poDetail ? `${poDetail.po_number} · ${poDetail.vendor_name || "-"}` : ""}>
        {poDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Info label="Status" value={PO_STATUS_LABEL[poDetail.status] || poDetail.status} />
              <Info label="Total" value={idr(poDetail.total_cost)} />
              <Info label="Dibuat" value={poDetail.created_at ? new Date(poDetail.created_at).toLocaleDateString("id-ID") : "-"} />
              <Info label="Dibutuhkan" value={poDetail.expected_date || "-"} />
              <Info label="Invoice" value={poDetail.invoice_status} />
              {poDetail.received_date && <Info label="Diterima" value={poDetail.received_date} />}
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Item</div>
              <div className="space-y-1.5">
                {(poDetail.items || []).map((it, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>{it.part_name}</span>
                    <span className="text-muted-foreground">{it.quantity} × {idr(it.unit_price)} = {idr(it.total_price)}</span>
                  </div>
                ))}
              </div>
            </div>
            {poDetail.notes && <p className="rounded-xl border border-border p-3 text-sm">{poDetail.notes}</p>}
          </div>
        )}
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Terima Purchase Order">
        {receipt && <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Stok seluruh item akan ditambahkan dan stock movement dicatat. Penerimaan tidak dapat diulang.</p>
          <Field label="Gudang penerimaan" required>
            <Select value={receipt.warehouse_id} onChange={(e) => setReceipt({ ...receipt, warehouse_id: e.target.value })}>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReceipt(null)}>Batal</Button><Button disabled={saving} onClick={confirmReceipt}>{saving ? "Memproses..." : "Konfirmasi Penerimaan"}</Button></div>
        </div>}
      </Modal>

      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} onConfirm={confirmDel}
        title="Hapus Data" message={`Hapus "${del?.label}"?`}
      />
    </Reveal>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, PackageX, Package, AlertTriangle, Boxes, Warehouse, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useApp, idr } from "../store/store";
import {
  PageHeader, Card, Table, Pill, StatCard, Button, IconButton, SearchInput,
  Modal, ConfirmDialog, Field, Input, Select, Reveal, Tabs,
} from "../components/kit";
import {
  listSpareParts, createSparePart, updateSparePart, archiveSparePart,
  listWarehouses, createWarehouse, updateWarehouse, archiveWarehouse,
  listSparePartCategories, adjustStock,
} from "../lib/inventory";
import { listSites } from "../lib/assets";

const blankPart = {
  site_id: "", spare_part_category_id: "", code: "", name: "", description: "",
  unit: "pcs", barcode: "", min_stock: 0, reorder_point: 0, unit_cost: 0,
};
const blankWarehouse = { site_id: "", code: "", name: "", description: "" };

const stockStatus = (part) => {
  const qty = part.total_quantity ?? 0;
  if (qty === 0) return "Critical";
  if (qty <= (part.min_stock ?? 0)) return "Low";
  return "OK";
};

export default function Inventory() {
  const { user } = useApp();
  const canEdit = ["company_admin", "manager"].includes(user?.role);

  const [tab, setTab] = useState("parts");
  const [loading, setLoading] = useState(true);
  const [spareParts, setSpareParts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sites, setSites] = useState([]);

  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [warehouseForm, setWarehouseForm] = useState(null);
  const [del, setDel] = useState(null);
  const [delWarehouse, setDelWarehouse] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [stockAdj, setStockAdj] = useState({ warehouse_id: "", type: "IN", quantity: 1, reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [partsRes, whRes, catRes, sitesRes] = await Promise.all([
        listSpareParts({ search: q || undefined }),
        listWarehouses(),
        listSparePartCategories(),
        listSites(),
      ]);
      setSpareParts(partsRes.data || []);
      setWarehouses(whRes.data || []);
      setCategories(catRes.data || []);
      setSites(sitesRes.data || []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat data inventory.");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => spareParts.filter((p) =>
    (p.name || "").toLowerCase().includes(q.toLowerCase()) ||
    (p.code || "").toLowerCase().includes(q.toLowerCase()) ||
    (p.spare_part_category_id || "").toLowerCase().includes(q.toLowerCase())
  ), [spareParts, q]);

  const lowCount = spareParts.filter((p) => (p.total_quantity ?? 0) <= (p.min_stock ?? 0)).length;
  const totalValue = spareParts.reduce((s, p) => s + (p.total_quantity ?? 0) * (p.unit_cost ?? 0), 0);
  const categoryName = (id) => categories.find((c) => c.id === id)?.name || "-";
  const warehouseName = (id) => warehouses.find((w) => w.id === id)?.name || "-";

  /* ---- spare part CRUD ---- */
  const savePart = async () => {
    if (!form.name?.trim() || !form.code?.trim() || !form.site_id) {
      toast.error("Kode, nama, dan site wajib diisi.");
      return;
    }
    setSaving(true);
    const payload = {
      site_id: form.site_id,
      spare_part_category_id: form.spare_part_category_id || null,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description || null,
      unit: form.unit || "pcs",
      barcode: form.barcode || null,
      min_stock: Number(form.min_stock) || 0,
      reorder_point: Number(form.reorder_point) || 0,
      unit_cost: Number(form.unit_cost) || null,
    };
    try {
      if (form.id) {
        await updateSparePart(form.id, payload);
        toast.success("Sparepart diperbarui.");
      } else {
        await createSparePart(payload);
        toast.success("Sparepart ditambahkan.");
      }
      setForm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan sparepart.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelPart = async () => {
    try {
      await archiveSparePart(del.id);
      toast.success("Sparepart diarsipkan.");
      setDel(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menghapus sparepart.");
    }
  };

  /* ---- warehouse CRUD ---- */
  const saveWarehouse = async () => {
    if (!warehouseForm.name?.trim() || !warehouseForm.code?.trim() || !warehouseForm.site_id) {
      toast.error("Kode, nama, dan site wajib diisi.");
      return;
    }
    setSaving(true);
    const payload = {
      site_id: warehouseForm.site_id,
      code: warehouseForm.code.trim(),
      name: warehouseForm.name.trim(),
      description: warehouseForm.description || null,
    };
    try {
      if (warehouseForm.id) {
        await updateWarehouse(warehouseForm.id, payload);
        toast.success("Gudang diperbarui.");
      } else {
        await createWarehouse(payload);
        toast.success("Gudang ditambahkan.");
      }
      setWarehouseForm(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan gudang.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelWarehouse = async () => {
    try {
      await archiveWarehouse(delWarehouse.id);
      toast.success("Gudang diarsipkan.");
      setDelWarehouse(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menghapus gudang.");
    }
  };

  /* ---- stock adjustment ---- */
  const openStockModal = (part) => {
    setStockModal(part);
    setStockAdj({ warehouse_id: warehouses[0]?.id || "", type: "IN", quantity: 1, reason: "" });
  };

  const submitStockAdj = async () => {
    if (!stockAdj.warehouse_id) { toast.error("Pilih gudang."); return; }
    if (!stockAdj.quantity || Number(stockAdj.quantity) < 1) { toast.error("Jumlah minimal 1."); return; }
    setSaving(true);
    try {
      await adjustStock(stockModal.id, {
        warehouse_id: stockAdj.warehouse_id,
        type: stockAdj.type,
        quantity: Number(stockAdj.quantity),
        reason: stockAdj.reason || null,
      });
      toast.success("Stok berhasil disesuaikan.");
      setStockModal(null);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyesuaikan stok.");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "code", header: "Kode", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code}</span> },
    { key: "name", header: "Sparepart", render: (r) => (
      <div>
        <div className="font-semibold">{r.name}</div>
        <div className="text-xs text-muted-foreground">{categoryName(r.spare_part_category_id)}</div>
      </div>
    ) },
    { key: "qty", header: "Stok", render: (r) => (
      <span className="tabular-nums">
        {r.total_quantity ?? 0}
        <span className="text-xs text-muted-foreground"> / min {r.min_stock ?? 0} {r.unit}</span>
      </span>
    ) },
    { key: "unit_cost", header: "Harga Satuan", render: (r) => <span className="tabular-nums text-sm">{idr(r.unit_cost ?? 0)}</span> },
    { key: "status", header: "Status", render: (r) => {
      const s = stockStatus(r);
      return <Pill tone={s === "OK" ? "success" : s === "Low" ? "warning" : "danger"}>{s}</Pill>;
    } },
    { key: "act", header: "", render: (r) => (
      <div className="flex justify-end gap-1.5">
        {canEdit && (
          <IconButton onClick={() => openStockModal(r)} title="Sesuaikan Stok">
            <TrendingUp className="h-4 w-4" />
          </IconButton>
        )}
        {canEdit && <IconButton onClick={() => setForm({ ...blankPart, ...r })}><Pencil className="h-4 w-4" /></IconButton>}
        {canEdit && <IconButton onClick={() => setDel(r)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></IconButton>}
      </div>
    ) },
  ];

  return (
    <Reveal>
      <PageHeader
        title="Inventory Sparepart"
        subtitle="Kelola stok suku cadang, gudang, dan titik pemesanan ulang."
        action={canEdit && (
          <Button onClick={() => setForm({ ...blankPart, site_id: sites[0]?.id || "" })} disabled={sites.length === 0}>
            <Plus className="h-4 w-4" /> Tambah Sparepart
          </Button>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Boxes} label="Total SKU" value={spareParts.length} tone="primary" />
        <StatCard icon={AlertTriangle} label="Perlu Restock" value={lowCount} tone="warning" />
        <StatCard icon={Package} label="Nilai Inventory" value={idr(totalValue)} tone="success" />
        <StatCard icon={Warehouse} label="Total Gudang" value={warehouses.length} tone="accent" />
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[{ key: "parts", label: "Spare Parts" }, { key: "warehouses", label: "Warehouses" }]}
          active={tab} onChange={setTab}
        />
      </div>

      {tab === "parts" && (
        <Card>
          <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Cari sparepart..." /></div>
          <Table
            columns={columns}
            rows={rows}
            empty={
              loading
                ? "Memuat..."
                : <span className="flex flex-col items-center gap-2"><PackageX className="h-8 w-8 text-muted-foreground" />Tidak ada sparepart.</span>
            }
          />
        </Card>
      )}

      {tab === "warehouses" && (
        <>
          {canEdit && (
            <div className="mb-4 flex justify-end">
              <Button onClick={() => setWarehouseForm({ ...blankWarehouse, site_id: sites[0]?.id || "" })} disabled={sites.length === 0}>
                <Plus className="h-4 w-4" /> Tambah Gudang
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {warehouses.length === 0 && !loading && (
              <p className="col-span-full text-sm text-muted-foreground">Belum ada gudang.</p>
            )}
            {warehouses.map((w) => {
              const itemsHere = spareParts.filter((p) =>
                (p.stocks || []).some((s) => s.warehouse_id === w.id)
              ).length;
              return (
                <Card key={w.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Warehouse className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-display font-bold text-foreground">{w.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{w.code}</div>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1.5">
                        <IconButton onClick={() => setWarehouseForm({ ...w })}><Pencil className="h-4 w-4" /></IconButton>
                        <IconButton onClick={() => setDelWarehouse(w)} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></IconButton>
                      </div>
                    )}
                  </div>
                  {w.description && (
                    <div className="mt-2 text-xs text-muted-foreground">{w.description}</div>
                  )}
                  <div className="mt-3 text-xs text-muted-foreground">{itemsHere} jenis sparepart tersimpan</div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Spare Part Form Modal */}
      <Modal
        open={!!form} onClose={() => setForm(null)}
        title={form?.id ? "Edit Sparepart" : "Tambah Sparepart"} wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>Batal</Button>
            <Button onClick={savePart} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Site" required>
              <Select value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
                <option value="">Pilih site...</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Kategori">
              <Select value={form.spare_part_category_id || ""} onChange={(e) => setForm({ ...form, spare_part_category_id: e.target.value })}>
                <option value="">Tanpa kategori</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Kode" required><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SP-001" /></Field>
            <Field label="Nama" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Satuan"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs" /></Field>
            <Field label="Barcode"><Input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
            <Field label="Stok Minimum"><Input type="number" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></Field>
            <Field label="Reorder Point"><Input type="number" min="0" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} /></Field>
            <Field label="Harga Satuan (Rp)"><Input type="number" min="0" value={form.unit_cost || ""} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></Field>
            <div className="sm:col-span-2">
              <Field label="Deskripsi"><Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            </div>
          </div>
        )}
      </Modal>

      {/* Warehouse Form Modal */}
      <Modal
        open={!!warehouseForm} onClose={() => setWarehouseForm(null)}
        title={warehouseForm?.id ? "Edit Gudang" : "Tambah Gudang"} wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setWarehouseForm(null)}>Batal</Button>
            <Button onClick={saveWarehouse} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {warehouseForm && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Site" required>
              <Select value={warehouseForm.site_id} onChange={(e) => setWarehouseForm({ ...warehouseForm, site_id: e.target.value })}>
                <option value="">Pilih site...</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Kode" required><Input value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} placeholder="WH-001" /></Field>
            <Field label="Nama" required><Input value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} /></Field>
            <Field label="Deskripsi"><Input value={warehouseForm.description || ""} onChange={(e) => setWarehouseForm({ ...warehouseForm, description: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal
        open={!!stockModal} onClose={() => setStockModal(null)}
        title={`Sesuaikan Stok — ${stockModal?.name || ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStockModal(null)}>Batal</Button>
            <Button onClick={submitStockAdj} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {stockModal && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Gudang" required>
              <Select value={stockAdj.warehouse_id} onChange={(e) => setStockAdj({ ...stockAdj, warehouse_id: e.target.value })}>
                <option value="">Pilih gudang...</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Tipe">
              <Select value={stockAdj.type} onChange={(e) => setStockAdj({ ...stockAdj, type: e.target.value })}>
                <option value="IN">Masuk (IN)</option>
                <option value="OUT">Keluar (OUT)</option>
                <option value="ADJUSTMENT">Penyesuaian (ADJUSTMENT)</option>
              </Select>
            </Field>
            <Field label="Jumlah" required>
              <Input type="number" min="1" value={stockAdj.quantity} onChange={(e) => setStockAdj({ ...stockAdj, quantity: e.target.value })} />
            </Field>
            <Field label="Alasan">
              <Input value={stockAdj.reason} onChange={(e) => setStockAdj({ ...stockAdj, reason: e.target.value })} placeholder="Opsional" />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} onConfirm={confirmDelPart}
        title="Arsipkan Sparepart" message={`Arsipkan "${del?.name}"?`}
      />
      <ConfirmDialog
        open={!!delWarehouse} onClose={() => setDelWarehouse(null)} onConfirm={confirmDelWarehouse}
        title="Arsipkan Gudang" message={`Arsipkan gudang "${delWarehouse?.name}"?`}
      />
    </Reveal>
  );
}

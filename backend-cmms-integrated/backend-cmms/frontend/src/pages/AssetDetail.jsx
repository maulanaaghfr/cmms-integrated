import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, ClipboardPlus, MapPin, Pause, Play, RotateCcw, Save, Wrench, Camera, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Card, Pill, Button, Modal, Reveal, Textarea } from "../components/kit";
import { PhotoCapture, SignaturePad } from "../components/mobile-kit";
import { getAsset, listLocations, listSites, listAssetCategories, updateAsset } from "../lib/assets";
import { getWorkOrder, listWorkOrders, signWorkOrder, updateWorkOrderChecklist, workOrderAction } from "../lib/workorders";
import { uploadAttachment } from "../lib/requests";
import AssetQrLabel from "../components/AssetQrLabel";

const PHOTO_ROLES = ["BEFORE", "DURING", "AFTER"];

const dataUrlToFile = async (dataUrl, name) => {
  const response = await fetch(dataUrl);
  return new File([await response.blob()], name, { type: "image/png" });
};

export default function AssetDetail() {
  const { assetId } = useParams();
  const [asset, setAsset] = useState(null);
  const [locations, setLocations] = useState([]);
  const [sites, setSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [updatingWorkOrder, setUpdatingWorkOrder] = useState("");
  const [completionWorkOrder, setCompletionWorkOrder] = useState(null);
  const [completionDetail, setCompletionDetail] = useState(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [photos, setPhotos] = useState({ BEFORE: [], DURING: [], AFTER: [] });

  const reloadWorkOrders = async () => {
    const response = await listWorkOrders({ asset_id: assetId });
    setWorkOrders(response.data || []);
  };

  useEffect(() => {
    setAsset(null);
    Promise.all([
      getAsset(assetId),
      listLocations(),
      listSites(),
      listAssetCategories(),
      listWorkOrders({ asset_id: assetId }),
    ])
      .then(([assetResponse, locationsResponse, sitesResponse, categoriesResponse, workOrdersResponse]) => {
        const currentAsset = assetResponse.data;
        setAsset(currentAsset);
        setLocationId(currentAsset.location_id || "");
        setLocations(locationsResponse.data || []);
        setSites(sitesResponse.data || []);
        setCategories(categoriesResponse.data || []);
        setWorkOrders(workOrdersResponse.data || []);
      })
      .catch((error) => toast.error(error.message || "Gagal memuat detail Asset."));
  }, [assetId]);

  const siteName = useMemo(() => {
    const map = new Map(sites.map((site) => [site.id, site.name || site.code || site.id]));
    return (id) => (id ? map.get(id) || id : "-");
  }, [sites]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name || category.id]));
    return (id) => (id ? map.get(id) || id : "-");
  }, [categories]);

  const locationName = useMemo(() => {
    const map = new Map(locations.map((location) => [location.id, location.name || location.code || location.id]));
    return (id) => (id ? map.get(id) || id : "-");
  }, [locations]);

  const locationOptions = useMemo(
    () => (asset?.site_id ? locations.filter((location) => location.site_id === asset.site_id) : locations),
    [locations, asset]
  );

  const updateProgress = async (workOrder, action) => {
    if (action === "complete") {
      setCompletionWorkOrder(workOrder);
      setCompletionDetail(null);
      setCompletionNote("");
      setPhotos({ BEFORE: [], DURING: [], AFTER: [] });
      setCompletionLoading(true);
      try {
        const response = await getWorkOrder(workOrder.id);
        setCompletionDetail(response.data);
      } catch (error) {
        toast.error(error.message || "Gagal memuat persyaratan penyelesaian Work Order.");
        setCompletionWorkOrder(null);
      } finally {
        setCompletionLoading(false);
      }
      return;
    }

    let body = {};
    if (action === "hold") {
      const reason = window.prompt("Alasan pekerjaan ditunda:");
      if (reason === null || !reason.trim()) return;
      body = { reason: reason.trim() };
    }
    setUpdatingWorkOrder(`${workOrder.id}:${action}`);
    try {
      await workOrderAction(workOrder.id, action, body);
      await reloadWorkOrders();
      toast.success("Progres Work Order berhasil diperbarui.");
    } catch (error) {
      toast.error(error.message || "Progres Work Order gagal diperbarui.");
    } finally {
      setUpdatingWorkOrder("");
    }
  };

  const updateChecklist = async (item, checked) => {
    setUpdatingWorkOrder(`${completionWorkOrder.id}:checklist`);
    try {
      const response = await updateWorkOrderChecklist(completionWorkOrder.id, item.id, {
        is_completed: checked,
        note: item.note || null,
      });
      setCompletionDetail((current) => ({
        ...current,
        checklist: (current.checklist || []).map((row) => row.id === item.id ? response.data : row),
      }));
      toast.success(checked ? "Checklist selesai." : "Checklist dibuka kembali.");
    } catch (error) {
      toast.error(error.message || "Gagal menyimpan checklist.");
    } finally {
      setUpdatingWorkOrder("");
    }
  };

  const addPhoto = async (role, photo) => {
    setPhotos((current) => ({ ...current, [role]: [...current[role], photo] }));
    try {
      await uploadAttachment("WORK_ORDER", completionWorkOrder.id, await dataUrlToFile(photo.url, `${role.toLowerCase()}-${Date.now()}.png`), role);
      const response = await getWorkOrder(completionWorkOrder.id);
      setCompletionDetail(response.data);
      toast.success(`Foto ${role.toLowerCase()} tersimpan.`);
    } catch (error) {
      setPhotos((current) => ({ ...current, [role]: current[role].filter((item) => item !== photo) }));
      toast.error(error.message || "Gagal menyimpan foto.");
    }
  };

  const saveSignedCompletion = async (signatureData) => {
    if (!completionWorkOrder || !completionDetail || !completionNote.trim()) {
      toast.error("Catatan penyelesaian wajib diisi.");
      return;
    }
    const incompleteChecklist = (completionDetail.checklist || []).some((item) => item.is_required && !item.is_completed);
    const missingPhoto = PHOTO_ROLES.find((role) => !(completionDetail.evidence?.[role]?.length));
    if (incompleteChecklist) {
      toast.error("Selesaikan semua checklist wajib terlebih dahulu.");
      return;
    }
    if (missingPhoto) {
      toast.error(`Foto ${missingPhoto.toLowerCase()} wajib diunggah terlebih dahulu.`);
      return;
    }

    setUpdatingWorkOrder(`${completionWorkOrder.id}:complete`);
    try {
      await signWorkOrder(completionWorkOrder.id, { signature_data: signatureData });
      await workOrderAction(completionWorkOrder.id, "complete", { completion_note: completionNote.trim() });
      await reloadWorkOrders();
      setCompletionWorkOrder(null);
      setCompletionDetail(null);
      setCompletionNote("");
      toast.success("Tanda tangan tersimpan dan Work Order selesai.");
    } catch (error) {
      toast.error(error.message || "Work Order gagal diselesaikan.");
    } finally {
      setUpdatingWorkOrder("");
    }
  };

  const saveLocation = async () => {
    setSavingLocation(true);
    try {
      const response = await updateAsset(assetId, { location_id: locationId || null });
      setAsset(response.data);
      toast.success("Lokasi Asset berhasil diperbarui.");
    } catch (error) {
      toast.error(error.message || "Lokasi Asset gagal diperbarui.");
    } finally {
      setSavingLocation(false);
    }
  };

  if (!asset) return <div className="p-6 text-sm text-muted-foreground">Memuat detail Asset...</div>;

  return (
    <Reveal className="mx-auto max-w-5xl">
      <Link to="/assets" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> Kembali ke Asset</Link>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs text-muted-foreground">{asset.code}</p><h1 className="mt-1 font-display text-2xl font-extrabold">{asset.name}</h1></div><Pill tone="success">{asset.status}</Pill></div>
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">{[["Site", siteName(asset.site_id)], ["Lokasi", locationName(asset.location_id)], ["Kategori", categoryName(asset.asset_category_id)], ["Serial Number", asset.serial_number || "-"], ["Manufacturer", asset.manufacturer || "-"], ["Model", asset.model || "-"]].map(([label, value]) => <div key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>)}</div>
            <div className="mt-6 flex flex-wrap gap-2"><Link to={`/work-orders?asset_id=${asset.id}`}><Button><Wrench className="h-4 w-4" /> Work Order</Button></Link><Link to={`/requests?asset_id=${asset.id}`}><Button variant="outline"><ClipboardPlus className="h-4 w-4" /> Maintenance Request</Button></Link></div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Update lokasi Asset</div><p className="mt-1 text-xs text-muted-foreground">Teknisi dapat memperbarui lokasi setelah Asset dipindahkan.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><select className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Pilih lokasi</option>{locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name || location.code || location.id}</option>)}</select><Button onClick={saveLocation} disabled={savingLocation || locationId === (asset.location_id || "")}><Save className="h-4 w-4" /> {savingLocation ? "Menyimpan..." : "Simpan lokasi"}</Button></div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-bold">Work Order terkait</h2><Link to={`/work-orders?asset_id=${asset.id}`} className="text-xs font-semibold text-primary">Lihat semua</Link></div>
            {workOrders.length ? <div className="divide-y">{workOrders.slice(0, 5).map((workOrder) => { const busy = updatingWorkOrder.startsWith(`${workOrder.id}:`); const action = workOrder.status === "ASSIGNED" ? "start" : workOrder.status === "IN_PROGRESS" ? "complete" : workOrder.status === "ON_HOLD" ? "resume" : null; return <div key={workOrder.id} className="py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{workOrder.title || workOrder.work_order_number || workOrder.id}</p><p className="text-xs text-muted-foreground">{workOrder.work_order_number || workOrder.id}</p></div><Pill tone={workOrder.status === "COMPLETED" ? "success" : "primary"}>{workOrder.status || "-"}</Pill></div>{action && <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => updateProgress(workOrder, action)}>{action === "start" ? <><Play className="h-3.5 w-3.5" /> Mulai pekerjaan</> : action === "resume" ? <><RotateCcw className="h-3.5 w-3.5" /> Lanjutkan</> : <><Check className="h-3.5 w-3.5" /> Selesaikan</>}</Button>{workOrder.status === "IN_PROGRESS" && <Button variant="ghost" disabled={busy} onClick={() => updateProgress(workOrder, "hold")}><Pause className="h-3.5 w-3.5" /> Tunda</Button>}</div>}</div>; })}</div> : <p className="text-sm text-muted-foreground">Belum ada Work Order untuk Asset ini.</p>}
          </Card>
        </div>
        <AssetQrLabel asset={asset} />
      </div>

      <Modal open={!!completionWorkOrder} onClose={() => !updatingWorkOrder && setCompletionWorkOrder(null)} title="Selesaikan Work Order">
        {completionLoading && <p className="text-sm text-muted-foreground">Memuat checklist dan persyaratan evidence...</p>}
        {!completionLoading && completionDetail && <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Sebelum dikirim, backend mewajibkan semua checklist wajib, foto <b>before</b>, <b>during</b>, <b>after</b>, tanda tangan digital, dan catatan penyelesaian.</div>
          <section><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-primary" /> Checklist</div><div className="space-y-2">{(completionDetail.checklist || []).length === 0 && <p className="text-xs text-muted-foreground">Tidak ada checklist.</p>}{(completionDetail.checklist || []).map((item) => <label key={item.id} className="flex items-start gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={!!item.is_completed} disabled={updatingWorkOrder || completionDetail.status !== "IN_PROGRESS"} onChange={(event) => updateChecklist(item, event.target.checked)} className="mt-0.5 accent-primary" /><span className={item.is_completed ? "text-muted-foreground line-through" : "font-medium"}>{item.label}{item.is_required && <span className="ml-1 text-destructive">*</span>}</span></label>)}</div></section>
          <section><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4 text-primary" /> Foto evidence</div><div className="space-y-3">{PHOTO_ROLES.map((role) => <div key={role} className="rounded-lg border p-2"><p className="mb-1 text-xs font-semibold">Foto {role.toLowerCase()} <span className="text-destructive">*</span></p><PhotoCapture photos={photos[role]} onAdd={(photo) => addPhoto(role, photo)} onRemove={(index) => setPhotos((current) => ({ ...current, [role]: current[role].filter((_, i) => i !== index) }))} /><p className="mt-1 text-[11px] text-muted-foreground">Tersimpan: {completionDetail.evidence?.[role]?.length || 0}</p></div>)}</div></section>
          <Textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} placeholder="Catatan penyelesaian pekerjaan (wajib)" rows={3} />
          <div><p className="mb-2 text-sm font-semibold">Tanda tangan teknisi</p><SignaturePad onSave={saveSignedCompletion} /></div>
        </div>}
      </Modal>
    </Reveal>
  );
}
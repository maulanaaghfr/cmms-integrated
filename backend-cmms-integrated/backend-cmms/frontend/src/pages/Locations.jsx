import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin, Pencil, Plus, Trash2, Building2, LayoutGrid, DoorOpen, Download,
  ChevronLeft, ChevronRight, Eye, MoreHorizontal, Loader2,
} from "lucide-react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { useApp } from "../store/store";
import { Button, Card, Field, IconButton, Input, Modal, PageHeader, Pill, Reveal, SearchInput, Select, Table, Textarea } from "../components/kit";
import { archiveLocation, archiveSite, createLocation, createSite, listLocations, listSites, updateLocation, updateSite } from "../lib/organization";
import { listAssets } from "../lib/assets";

const LOCATION_TYPES = ["AREA", "BUILDING", "FLOOR", "ROOM", "LINE", "ZONE", "OTHER"];
const TYPE_LABEL = { AREA: "Area", BUILDING: "Gedung", FLOOR: "Lantai", ROOM: "Ruang", LINE: "Lini", ZONE: "Zona", OTHER: "Lainnya" };
const TYPE_ICON = { AREA: LayoutGrid, BUILDING: Building2, FLOOR: Building2, ROOM: DoorOpen, LINE: Building2, ZONE: MapPin, OTHER: MapPin };
const PAGE_SIZE = 5;

// Cycled per row purely for visual variety — the backend has no dedicated
// "business type" field, so color/icon come from the site's dominant
// location type instead.
const ROW_COLORS = [
  { bg: "bg-blue-50", text: "text-blue-600", pill: "bg-blue-50 text-blue-600" },
  { bg: "bg-emerald-50", text: "text-emerald-600", pill: "bg-emerald-50 text-emerald-600" },
  { bg: "bg-indigo-50", text: "text-indigo-600", pill: "bg-indigo-50 text-indigo-600" },
  { bg: "bg-amber-50", text: "text-amber-600", pill: "bg-amber-50 text-amber-600" },
  { bg: "bg-teal-50", text: "text-teal-600", pill: "bg-teal-50 text-teal-600" },
  { bg: "bg-rose-50", text: "text-rose-600", pill: "bg-rose-50 text-rose-600" },
];

const PIN_PALETTE = ["#ec4899", "#8b5cf6", "#2563eb", "#0d9488", "#dc2626", "#d97706", "#16a34a"];

// Deterministic color per row, derived from the row's own id/code — doesn't
// depend on the Table component passing a row index to `render` (it doesn't).
function colorForRow(row) {
  const seed = String(row?.id ?? row?.code ?? "");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ROW_COLORS[hash % ROW_COLORS.length];
}

const blankLocation = { site_id: "", parent_location_id: "", code: "", name: "", location_type: "AREA", description: "" };
const blankSite = { code: "", name: "", address: "", timezone: "Asia/Jakarta" };

/* ---------------------------------------------------------------------- */
/* Geocoding: the backend doesn't store lat/lng per site, so we resolve   */
/* coordinates client-side from `site.address` via the free OSM Nominatim */
/* API and cache the result in localStorage. Nominatim's usage policy     */
/* caps requests at ~1/sec, so lookups run sequentially with a delay.     */
/* For production, geocode once and persist lat/lng on the site record    */
/* instead of doing this on every page load.                              */
/* ---------------------------------------------------------------------- */
const GEOCODE_CACHE_PREFIX = "cmms:geocode:";

async function geocodeAddress(address) {
  const key = GEOCODE_CACHE_PREFIX + address;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore storage errors */ }

  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.[0]) return null;
  const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  try { localStorage.setItem(key, JSON.stringify(coords)); } catch { /* ignore storage errors */ }
  return coords;
}

function pinDivIcon(color, label) {
  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;align-items:center;gap:6px;transform:translate(-4px,-30px);">
        <svg width="26" height="30" viewBox="0 0 26 30" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));">
          <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 17 13 17s13-7.3 13-17C26 5.8 20.2 0 13 0z" fill="${color}"/>
          <circle cx="13" cy="13" r="5.5" fill="white"/>
        </svg>
        <span style="background:white;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;color:${color};white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.2);">${label}</span>
      </div>`,
    iconSize: [0, 0],
  });
}

const DEFAULT_CENTER = [-7.4478, 112.7183]; // Sidoarjo, fallback when nothing geocoded yet

function SiteMap({ sites, onAdd, canEdit, overlayOpen = false }) {
  const [coords, setCoords] = useState({}); // site_id -> {lat, lng}
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const targets = sites.filter((s) => s.address && !coords[s.id]);
      if (targets.length === 0) return;
      setResolving(true);
      for (const site of targets) {
        if (cancelled) return;
        try {
          const c = await geocodeAddress(site.address);
          if (c && !cancelled) setCoords((prev) => ({ ...prev, [site.id]: c }));
        } catch { /* skip failed lookups */ }
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (!cancelled) setResolving(false);
    }
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites]);

  const markers = sites.filter((s) => coords[s.id]);
  const center = markers.length
    ? [
        markers.reduce((sum, s) => sum + coords[s.id].lat, 0) / markers.length,
        markers.reduce((sum, s) => sum + coords[s.id].lng, 0) / markers.length,
      ]
    : DEFAULT_CENTER;

  return (
    <Card className="relative z-0 isolate flex h-full flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between p-4 pb-3">
        <h3 className="font-display text-sm font-bold text-foreground">Peta Lokasi</h3>
        {canEdit && (
          <Button className="px-3! py-1.5! text-xs" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> Tambah Lokasi
          </Button>
        )}
      </div>
      <div className={`relative z-0 min-h-55 flex-1 ${overlayOpen ? "pointer-events-none" : ""}`} aria-hidden={overlayOpen}>
        {sites.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Belum ada site.</div>
        ) : (
          <MapContainer className="relative z-0" center={center} zoom={markers.length ? 13 : 11} scrollWheelZoom={false} style={{ height: "100%", width: "100%", minHeight: 220, zIndex: 0 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {sites.map((site, i) => {
              const c = coords[site.id];
              if (!c) return null;
              const color = PIN_PALETTE[i % PIN_PALETTE.length];
              return (
                <Marker key={site.id} position={[c.lat, c.lng]} icon={pinDivIcon(color, site.name)} />
              );
            })}
          </MapContainer>
        )}
        {resolving && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow">
            <Loader2 className="h-3 w-3 animate-spin" /> Menentukan lokasi peta...
          </div>
        )}
      </div>
      <p className="px-4 py-2 text-[11px] text-muted-foreground">Posisi pin dihitung otomatis dari alamat site (OpenStreetMap).</p>
    </Card>
  );
}

function toCsv(rows) {
  const header = ["Nama Lokasi", "Tipe", "Kode", "Alamat", "Jumlah Area", "Jumlah Aset", "Status"];
  const lines = rows.map((r) => [r.name, r.types[0] ? TYPE_LABEL[r.types[0]] : "-", r.code, r.address || "", r.areaCount, r.assetCount, r.is_active ? "Aktif" : "Nonaktif"]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

function RowMenu({ canEdit, onView, onEdit, onArchive }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <IconButton title="Aksi" onClick={() => setOpen((o) => !o)}><MoreHorizontal className="h-4 w-4" /></IconButton>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border bg-card py-1 shadow-lg">
          <button onClick={() => { setOpen(false); onView(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted">
            <Eye className="h-3.5 w-3.5" /> Lihat area
          </button>
          {canEdit && (
            <button onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted">
              <Pencil className="h-3.5 w-3.5" /> Edit site
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setOpen(false); onArchive(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10">
              <Trash2 className="h-3.5 w-3.5" /> Arsipkan
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Locations() {
  const { user } = useApp();
  const role = user?._backend?.membership?.roleKey;
  const canEdit = ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(role);

  const [sites, setSites] = useState([]);
  const [locations, setLocations] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [page, setPage] = useState(1);

  const [locationForm, setLocationForm] = useState(null);
  const [siteForm, setSiteForm] = useState(null);
  const [detailSite, setDetailSite] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [siteRes, locationRes, assetRes] = await Promise.all([listSites(), listLocations(), listAssets()]);
      setSites(siteRes.data || []);
      setLocations(locationRes.data || []);
      setAssets(assetRes.data || []);
    } catch (error) {
      toast.error(error.message || "Gagal memuat data lokasi.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const typeCounts = useMemo(() => {
    const counts = {};
    LOCATION_TYPES.forEach((t) => { counts[t] = 0; });
    locations.forEach((l) => { counts[l.location_type] = (counts[l.location_type] || 0) + 1; });
    return counts;
  }, [locations]);

  const siteRows = useMemo(() => {
    return sites.map((site) => {
      const siteLocations = locations.filter((l) => l.site_id === site.id);
      const siteAssets = assets.filter((a) => a.site_id === site.id);
      return {
        ...site,
        areaCount: siteLocations.length,
        assetCount: siteAssets.length,
        types: [...new Set(siteLocations.map((l) => l.location_type))],
      };
    });
  }, [sites, locations, assets]);

  const filteredRows = useMemo(() => {
    return siteRows.filter((row) => {
      if (statusFilter === "ACTIVE" && !row.is_active) return false;
      if (statusFilter === "INACTIVE" && row.is_active) return false;
      if (typeFilter !== "ALL" && !row.types.includes(typeFilter)) return false;
      if (query && !`${row.code} ${row.name} ${row.address || ""}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [siteRows, statusFilter, typeFilter, query]);

  useEffect(() => { setPage(1); }, [query, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const saveLocation = async () => {
    if (!locationForm.site_id || !locationForm.code.trim() || !locationForm.name.trim()) return toast.error("Site, kode, dan nama wajib diisi.");
    try {
      const payload = { ...locationForm, parent_location_id: locationForm.parent_location_id || null, description: locationForm.description || null };
      if (locationForm.id) await updateLocation(locationForm.id, payload);
      else await createLocation(payload);
      toast.success("Lokasi tersimpan.");
      setLocationForm(null);
      load();
    } catch (error) {
      toast.error(error.message || "Gagal menyimpan lokasi.");
    }
  };

  const saveSite = async () => {
    if (!siteForm.code.trim() || !siteForm.name.trim()) return toast.error("Kode dan nama site wajib diisi.");
    try {
      const payload = { ...siteForm, address: siteForm.address || null };
      if (siteForm.id) await updateSite(siteForm.id, payload);
      else await createSite(payload);
      toast.success("Site tersimpan.");
      setSiteForm(null);
      load();
    } catch (error) {
      toast.error(error.message || "Gagal menyimpan site.");
    }
  };

  const handleExport = () => {
    const csv = toCsv(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lokasi-aset-fasilitas.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: "name", header: "Nama lokasi", render: (row) => {
        const dominantType = row.types[0] || "BUILDING";
        const Icon = TYPE_ICON[dominantType] || Building2;
        const color = colorForRow(row);
        return (
          <div className="flex items-center gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${color.bg} ${color.text}`}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="font-semibold text-foreground">{row.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{row.code}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "type", header: "Tipe", render: (row) => {
        const dominantType = row.types[0];
        const color = colorForRow(row);
        return dominantType
          ? <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${color.pill}`}>{TYPE_LABEL[dominantType]}</span>
          : <span className="text-xs text-muted-foreground">-</span>;
      },
    },
    { key: "address", header: "Alamat", render: (row) => <span className="text-xs text-muted-foreground">{row.address || "-"}</span> },
    { key: "areaCount", header: "Jumlah Area", render: (row) => <span className="font-semibold tabular-nums">{row.areaCount}</span> },
    { key: "assetCount", header: "Jumlah aset", render: (row) => <span className="font-semibold tabular-nums">{row.assetCount}</span> },
    { key: "is_active", header: "Status", render: (row) => <Pill tone={row.is_active ? "success" : "muted"}>{row.is_active ? "AKTIF" : "NONAKTIF"}</Pill> },
    {
      key: "action", header: "Aksi", render: (row) => (
        <div className="flex justify-end">
          <RowMenu
            canEdit={canEdit}
            onView={() => setDetailSite(row)}
            onEdit={() => setSiteForm({ id: row.id, code: row.code, name: row.name, address: row.address || "", timezone: row.timezone || "Asia/Jakarta" })}
            onArchive={async () => {
              if (!window.confirm(`Arsipkan site ${row.name}?`)) return;
              try { await archiveSite(row.id); toast.success("Site diarsipkan."); load(); } catch (error) { toast.error(error.message); }
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <Reveal>
      <PageHeader title="Location" />

      <Card className="mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-foreground">Lokasi aset &amp; Fasilitas</h2>
            <p className="mt-1 text-xs text-muted-foreground">Kelola data lokasi untuk memudahkan penempatan dan pemantauan aset</p>
          </div>
          {canEdit && (
            <Button onClick={() => setLocationForm({ ...blankLocation, site_id: sites[0]?.id || "" })}>
              <Plus className="h-4 w-4" /> Tambah lokasi
            </Button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: MapPin, value: sites.length, label: "Total Lokasi" },
            { icon: Building2, value: typeCounts.BUILDING, label: "Gedung" },
            { icon: LayoutGrid, value: typeCounts.AREA, label: "Area" },
            { icon: DoorOpen, value: typeCounts.ROOM, label: "Ruang" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="font-display text-lg font-extrabold leading-none text-foreground">{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-5">
        <SiteMap
          sites={sites}
          canEdit={canEdit}
          overlayOpen={!!locationForm || !!siteForm || !!detailSite}
          onAdd={() => setLocationForm({ ...blankLocation, site_id: sites[0]?.id || "" })}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={query} onChange={setQuery} placeholder="Cari kode, nama, atau alamat..." />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto! text-xs">
              <option value="ALL">Semua Tipe</option>
              {LOCATION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto! text-xs">
              <option value="ACTIVE">Status Aktif</option>
              <option value="INACTIVE">Status Nonaktif</option>
              <option value="ALL">Semua Status</option>
            </Select>
            <Button variant="ghost" className="px-3! py-2! text-xs" onClick={handleExport}><Download className="h-3.5 w-3.5" /> Export</Button>
          </div>
        </div>

        <Table columns={columns} rows={pageRows} headerClassName="bg-muted/60" empty={loading ? "Memuat..." : "Belum ada lokasi."} />

        {filteredRows.length > 0 && (
          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} dari {filteredRows.length} data
            </p>
            <div className="flex items-center gap-1">
              <IconButton disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></IconButton>
              {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)} className={`h-9 w-9 rounded-lg text-xs font-semibold transition ${page === i + 1 ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground hover:bg-muted"}`}>{i + 1}</button>
              ))}
              <IconButton disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></IconButton>
            </div>
          </div>
        )}
      </Card>

      {/* Add/Edit Location */}
      <Modal open={!!locationForm} onClose={() => setLocationForm(null)} title={locationForm?.id ? "Edit lokasi" : "Tambah lokasi"} footer={<><Button variant="ghost" onClick={() => setLocationForm(null)}>Batal</Button><Button onClick={saveLocation}>Simpan</Button></>}>
        {locationForm && (
          <div className="space-y-4">
            <Field label="Site" required>
              <Select value={locationForm.site_id} onChange={(e) => setLocationForm({ ...locationForm, site_id: e.target.value, parent_location_id: "" })}>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </Select>
            </Field>
            <Field label="Kode" required><Input value={locationForm.code} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })} /></Field>
            <Field label="Nama" required><Input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} /></Field>
            <Field label="Tipe">
              <Select value={locationForm.location_type} onChange={(e) => setLocationForm({ ...locationForm, location_type: e.target.value })}>
                {LOCATION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Induk (opsional)">
              <Select value={locationForm.parent_location_id || ""} onChange={(e) => setLocationForm({ ...locationForm, parent_location_id: e.target.value })}>
                <option value="">Tanpa induk</option>
                {locations.filter((l) => l.site_id === locationForm.site_id && l.id !== locationForm.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Deskripsi"><Textarea value={locationForm.description} onChange={(e) => setLocationForm({ ...locationForm, description: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {/* Add/Edit Site */}
      <Modal open={!!siteForm} onClose={() => setSiteForm(null)} title={siteForm?.id ? "Edit site" : "Tambah site"} footer={<><Button variant="ghost" onClick={() => setSiteForm(null)}>Batal</Button><Button onClick={saveSite}>Simpan</Button></>}>
        {siteForm && (
          <div className="space-y-4">
            <Field label="Kode" required><Input value={siteForm.code} onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} /></Field>
            <Field label="Nama" required><Input value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></Field>
            <Field label="Alamat"><Input value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} /></Field>
            <Field label="Timezone"><Input value={siteForm.timezone} onChange={(e) => setSiteForm({ ...siteForm, timezone: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      {/* Site detail — its locations */}
      <Modal open={!!detailSite} onClose={() => setDetailSite(null)} title={detailSite ? `Area & lokasi — ${detailSite.name}` : ""} wide
        footer={canEdit && <Button onClick={() => setLocationForm({ ...blankLocation, site_id: detailSite.id })}><Plus className="h-4 w-4" /> Tambah lokasi di site ini</Button>}>
        {detailSite && (
          <div className="space-y-2">
            {locations.filter((l) => l.site_id === detailSite.id).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada area/lokasi di site ini.</p>
            )}
            {locations.filter((l) => l.site_id === detailSite.id).map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-foreground">{l.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{l.code} · {TYPE_LABEL[l.location_type] || l.location_type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={l.is_active ? "success" : "muted"}>{l.is_active ? "Aktif" : "Nonaktif"}</Pill>
                  {canEdit && (
                    <>
                      <IconButton onClick={() => setLocationForm({ ...l, description: l.description || "" })}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton className="hover:text-destructive" onClick={async () => {
                        if (!window.confirm(`Arsipkan ${l.name}?`)) return;
                        try { await archiveLocation(l.id); toast.success("Lokasi diarsipkan."); load(); setDetailSite((d) => d && { ...d }); } catch (error) { toast.error(error.message); }
                      }}><Trash2 className="h-4 w-4" /></IconButton>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Reveal>
  );
}
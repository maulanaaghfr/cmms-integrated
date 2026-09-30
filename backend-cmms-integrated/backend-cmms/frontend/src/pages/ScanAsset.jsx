import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { ArrowLeft, Camera, ImagePlus, ScanLine, MapPin, ClipboardList, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card, Button, Reveal } from "../components/kit";
import { listAssets, getAsset, scanAsset } from "../lib/assets";
import { listWorkOrders } from "../lib/workorders";

function assetIdFromValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Accept direct ULID/asset ID.
  if (/^[0-9A-HJKMNP-TV-Z]{20,30}$/i.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const pathMatch = url.pathname.match(
      /\/assets?\/([0-9A-HJKMNP-TV-Z]{20,30})(?:\/|$)/i,
    );
    if (pathMatch?.[1]) return pathMatch[1];

    for (const key of ["asset_id", "assetId", "id"]) {
      const queryValue = url.searchParams.get(key);
      if (queryValue && /^[0-9A-HJKMNP-TV-Z]{20,30}$/i.test(queryValue)) {
        return queryValue;
      }
    }
  } catch {
    // Continue with token/barcode matching below.
  }

  return null;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export default function ScanAsset() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const assetsRef = useRef([]);
  const [running, setRunning] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [result, setResult] = useState(null);
  const [resultLoading, setResultLoading] = useState(false);
  const loadingDataRef = useRef(true);

  useEffect(() => {
    loadingDataRef.current = loadingData;
  }, [loadingData]);

  useEffect(() => {
    let cancelled = false;
    listAssets()
      .then((response) => {
        if (!cancelled) assetsRef.current = response.data || [];
      })
      .catch(() => {
        if (!cancelled) toast.error("Data Asset tidak dapat dimuat.");
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleDecodedValue = useCallback(async (decodedText) => {
    if (handledRef.current || loadingDataRef.current) return;
    const decodedValue = String(decodedText ?? "").trim();
    if (!decodedValue) return;

    const assetId = assetIdFromValue(decodedValue);
    const key = normalize(decodedValue);
    let asset = assetsRef.current.find((item) => {
      const values = [
        item.id,
        item.barcode,
        item.code,
        item.serial_number,
        item.qr_token,
      ];

      return values.some((value) => normalize(value) === key)
        || (assetId && normalize(item.id) === normalize(assetId));
    });

    // Jangan hanya mencari di cache/list lokal.
    // Cari langsung ke database tenant agar barcode/code di luar
    // halaman pertama tetap ditemukan.
    if (!asset && !assetId) {
      try {
        const response = await listAssets({
          search: decodedValue,
          per_page: 100,
        });

        const serverAssets = response.data || [];
        asset = serverAssets.find((item) => {
          const values = [
            item.id,
            item.barcode,
            item.code,
            item.serial_number,
            item.qr_token,
          ];

          return values.some((value) => normalize(value) === key);
        }) || null;
      } catch (error) {
        console.error("SCAN_ASSET_SERVER_SEARCH_FAILED", error);
      }
    }

    if (!assetId && !asset) {
      toast.error(`QR/barcode "${decodedValue}" belum terdaftar pada tenant ini.`);
      return;
    }

    handledRef.current = true;
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    } catch {
      // Scanner may already be stopped.
    }
    setRunning(false);

    const id = asset?.id || assetId;

    setResultLoading(true);

    try {
      // Selalu ambil detail terbaru dari backend tenant aktif.
      // Data dari list/cache hanya dipakai untuk menemukan ID.
      let resolvedAsset = null;

      if (id) {
        const assetResponse = await getAsset(id);
        resolvedAsset = assetResponse.data || assetResponse.item || assetResponse;
      }

      if (!resolvedAsset || !resolvedAsset.id) {
        throw new Error("Detail aset tidak valid dari backend.");
      }

      try {
        await scanAsset(id);
      } catch {
        // Audit scan tidak boleh menghalangi tampilan detail aset.
      }

      const workOrderResponse = await listWorkOrders({ per_page: 100 });
      const related = (workOrderResponse.data || []).filter(
        (workOrder) => workOrder.asset_id === id,
      );

      setResult({
        asset: resolvedAsset || null,
        id,
        related,
      });
    } catch (error) {
      console.error("SCAN_ASSET_DETAIL_FAILED", error);
      setResult({
        asset: null,
        id,
        related: [],
        error: error?.response?.data?.message
          || error?.message
          || "Detail aset tidak dapat dimuat.",
      });
    } finally {
      setResultLoading(false);
    }
  }, [navigate, searchParams]);

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !scannerRef.current) return;
    setReadingFile(true);
    handledRef.current = false;
    try {
      if (scannerRef.current.isScanning) await scannerRef.current.stop();
      const decodedText = await scannerRef.current.scanFile(file, true);
      await handleDecodedValue(decodedText);
    } catch {
      toast.error("Barcode Asset tidak terbaca. Gunakan foto yang terang dan seluruh kode terlihat.");
    } finally {
      setReadingFile(false);
    }
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    if (!manualBarcode.trim()) {
      toast.error("Masukkan barcode Asset terlebih dahulu.");
      return;
    }
    handledRef.current = false;
    await handleDecodedValue(manualBarcode.trim());
  };

  useEffect(() => {
    const readerElement = document.getElementById("asset-qr-reader");
    // html5-qrcode appends its own video element. Clear leftovers before creating a new instance.
    readerElement?.replaceChildren();
    const scanner = new Html5Qrcode("asset-qr-reader");
    scannerRef.current = scanner;
    let cancelled = false;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 280, height: 180 }, aspectRatio: 1.7 },
      (decodedText) => { if (!cancelled) handleDecodedValue(decodedText); },
      () => {},
    ).then(() => {
      if (!cancelled) setRunning(true);
    }).catch(() => {
      if (!cancelled) toast.error("Kamera tidak dapat dibuka. Izinkan akses kamera lalu coba lagi.");
    });

    return () => {
      cancelled = true;
      let cleanup = Promise.resolve();
      if (scanner.isScanning) {
        try {
          const stopped = scanner.stop?.();
          cleanup = stopped && typeof stopped.then === "function"
            ? stopped.catch(() => {})
            : Promise.resolve();
        } catch {
          cleanup = Promise.resolve();
        }
      }
      cleanup.then(() => {
        const reader = document.getElementById("asset-qr-reader");
        if (!reader || !document.body.contains(reader)) return;
        try {
          const cleared = scanner.clear?.();
          if (cleared && typeof cleared.catch === "function") cleared.catch(() => {});
        } catch { /* scanner already disposed */ }
      });
    };
  }, [handleDecodedValue]);

  return (
    <Reveal className="mx-auto w-full max-w-xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
        <div><h1 className="font-display text-xl font-extrabold">Scan Barcode Asset</h1><p className="text-xs text-muted-foreground">Arahkan kamera ke QR atau barcode yang terpasang pada Asset.</p></div>
      </div>
      <Card className="overflow-hidden p-3 sm:p-5">
        <div id="asset-qr-reader" className="min-h-[300px] overflow-hidden rounded-xl bg-slate-950" />
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          {running ? <><ScanLine className="h-4 w-4 text-primary" /> {loadingData ? "Memuat data Asset..." : "Mencari barcode Asset..."}</> : <><Camera className="h-4 w-4" /> Menyiapkan kamera...</>}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Setelah berhasil, periksa identitas asset, lokasi terdaftar, dan pekerjaan terkait sebelum bertindak.</p>
        <div className="mt-5 border-t pt-4 text-center">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-muted ${readingFile ? "pointer-events-none opacity-60" : ""}`}>
            <ImagePlus className="h-4 w-4" />
            {readingFile ? "Membaca gambar..." : "Upload gambar barcode Asset"}
            <input type="file" accept="image/*" className="sr-only" onChange={handleImageUpload} disabled={readingFile} />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Pilih foto label Asset dari galeri atau screenshot.</p>
        </div>
        <form onSubmit={handleManualSubmit} className="mt-4 border-t pt-4">
          <label htmlFor="manual-asset-barcode" className="mb-2 block text-xs font-bold text-foreground">Input barcode manual</label>
          <div className="flex gap-2">
            <input id="manual-asset-barcode" value={manualBarcode} onChange={(event) => setManualBarcode(event.target.value)} placeholder="Contoh: AST-000123" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            <Button type="submit">Cari Asset</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Fallback jika kamera tidak tersedia atau barcode sulit terbaca.</p>
        </form>
      </Card>
      {result && (
        <Card className="mt-4 overflow-hidden border-blue-200 bg-blue-50/40 p-0">
          <div className="border-b border-blue-100 px-4 py-3"><div className="flex items-center gap-2 text-sm font-bold text-blue-900"><CheckCircle2 className="h-4 w-4" /> Asset ditemukan</div><p className="mt-1 font-mono text-xs text-blue-700">{result.asset?.barcode || result.asset?.code || result.id}</p></div>
          {resultLoading ? <p className="p-4 text-sm text-slate-500">Memuat pekerjaan terkait...</p> : <div className="space-y-3 p-4"><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-[10px] uppercase tracking-wide text-slate-500">Nama Asset</p><p className="font-semibold text-slate-900">{result.asset?.name || "—"}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-500">Status</p><p className="font-semibold text-slate-900">{result.asset?.status || "—"}</p></div><div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-wide text-slate-500">Lokasi terdaftar</p><p className="flex items-center gap-1 text-sm font-semibold text-slate-900"><MapPin className="h-3.5 w-3.5 text-blue-600" />{result.asset?.location_name || result.asset?.location || result.asset?.site_name || "Belum ada lokasi terdaftar"}</p></div></div><div className="rounded-xl border border-blue-100 bg-white p-3"><div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800"><ClipboardList className="h-4 w-4 text-blue-600" />Task / WO terkait ({result.related.length})</div>{result.related.length ? <div className="space-y-2">{result.related.slice(0, 5).map((workOrder) => <div key={workOrder.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><div><p className="text-xs font-semibold text-slate-800">{workOrder.title}</p><p className="text-[10px] text-slate-500">{workOrder.work_order_number} · {workOrder.status}</p></div><span className="text-[10px] text-slate-500">{workOrder.due_at ? new Date(workOrder.due_at).toLocaleDateString("id-ID") : "—"}</span></div>)}</div> : <p className="text-xs text-slate-500">Tidak ada WO terkait untuk asset ini.</p>}</div><div className="flex flex-wrap gap-2"><Button onClick={() => navigate(`/assets/${result.id}`)}><ExternalLink className="h-4 w-4" /> Buka Detail Asset</Button>{result.related[0] && <Button variant="ghost" onClick={() => navigate(`/work-orders?open=${result.related[0].id}`)}>Buka WO Aktif</Button>}</div></div>}
        </Card>
      )}
    </Reveal>
  );
}

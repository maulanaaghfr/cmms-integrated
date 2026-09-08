import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, ScanLine, MapPin, Navigation, Eraser, Check, WifiOff, Wifi, Image as ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";
import jsQR from "jsqr";

export const SLA_HOURS = { Critical: 4, High: 24, Medium: 72, Low: 168 };

/**
 * Loads a File/Blob as an <img> element instead of using createImageBitmap().
 * createImageBitmap() throws the native "The source image could not be
 * decoded" error on plenty of real-world files (iPhone HEIC saved as .jpg,
 * screenshots with unusual color profiles, some PNG variants, etc). A plain
 * <img> element is decoded by the browser's normal image pipeline, which is
 * far more tolerant, and both BarcodeDetector and <canvas> accept it directly.
 */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gambar tidak dapat dibaca. Coba file JPG/PNG lain atau ambil ulang screenshot-nya."));
    img.src = src;
  });
}

/**
 * Uppercasing every scanned value broke asset QR codes: they encode a full
 * URL like "https://app/assets?asset_id=xxxx", and query string keys/values
 * are case sensitive — "ASSET_ID" is NOT the same param as "asset_id". Plain
 * part/spare-part barcodes still get uppercased for consistent matching, but
 * URL-shaped values (asset QR codes) are passed through untouched.
 */
function normalizeScanValue(value) {
  const v = (value || "").trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  return v.toUpperCase();
}

/* --------------------------------- sheet ---------------------------------
 * On phones this renders as a bottom sheet (the familiar drag-up-from-edge
 * pattern). From the `sm` breakpoint up — where there's no thumb-reach
 * constraint and no OS "swipe from bottom" gesture to collide with — it
 * becomes a centered modal card instead, which is the pattern people expect
 * from mouse/keyboard use. `size` controls how wide that desktop modal gets,
 * since a signature pad needs far less room than a tabbed work-order detail.
 * --------------------------------------------------------------------- */
const SHEET_SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export function Sheet({ open, onClose, title, children, size = "md" }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/50 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={`aitoma-scroll max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-card p-4 pb-8 shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6 sm:pb-6 ${SHEET_SIZES[size] || SHEET_SIZES.md}`}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-bold text-foreground sm:text-lg">{title}</h3>
              <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/70">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------ SLA countdown ---------------------------- */
export function slaState(w) {
  if (!w.assignedAt && !w.due) return { label: "—", tone: "muted" };
  const target = SLA_HOURS[w.priority] || 72;
  const done = w.status === "Completed" || w.status === "Cancelled";
  if (done) return { label: "Selesai", tone: "success" };
  const start = w.assignedAt ? new Date(w.assignedAt).getTime() : Date.now();
  const deadline = start + target * 3600000;
  const msLeft = deadline - Date.now();
  if (msLeft <= 0) return { label: "SLA terlewat", tone: "danger" };
  const hLeft = msLeft / 3600000;
  if (hLeft <= target * 0.2) return { label: `${hLeft.toFixed(1)}h tersisa`, tone: "warning" };
  return { label: `${hLeft.toFixed(1)}h tersisa`, tone: "success" };
}
export function SlaBadge({ w }) {
  const s = slaState(w);
  const tones = { success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]", warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]", danger: "bg-destructive/10 text-destructive", muted: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[s.tone]}`}>{s.label}</span>;
}

/* ------------------------------ barcode scanner --------------------------- */
export function ScannerSheet({ open, onClose, onDetect, title = "Scan Barcode" }) {
  const videoRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onDetectRef = useRef(onDetect);
  const [manual, setManual] = useState("");
  const [camOn, setCamOn] = useState(false);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let scanTimer = null;
    navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamOn(true);
        const detector = "BarcodeDetector" in window
          ? new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"] })
          : null;
        scanTimer = window.setInterval(async () => {
          if (!videoRef.current || !active) return;
          try {
            let rawValue = "";
            if (detector) {
              const [result] = await detector.detect(videoRef.current);
              rawValue = result?.rawValue || "";
            } else {
              const canvas = canvasRef.current || document.createElement("canvas");
              canvasRef.current = canvas;
              canvas.width = videoRef.current.videoWidth || 640;
              canvas.height = videoRef.current.videoHeight || 480;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
              rawValue = code?.data || "";
            }
            if (rawValue) {
              active = false;
              if (scanTimer) window.clearInterval(scanTimer);
              onDetectRef.current?.(normalizeScanValue(rawValue));
              onCloseRef.current?.();
            }
          } catch { /* keep manual fallback available */ }
        }, 700);
      })
      .catch(() => setCamOn(false));
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (scanTimer) window.clearInterval(scanTimer);
    };
  }, [open]);

  const submit = () => {
    if (!manual.trim()) return toast.error("Masukkan kode barcode/QR.");
    onDetect(normalizeScanValue(manual));
    setManual("");
  };

  const scanImageFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      toast.error("File yang dipilih bukan gambar. Pilih file JPG/PNG/screenshot.");
      return;
    }
    setFileLoading(true);
    let objectUrl = null;
    try {
      // Use an object URL + <img> element instead of createImageBitmap().
      // createImageBitmap() is the source of the "source image could not be
      // decoded" error on many real gallery photos/screenshots; the normal
      // <img> decode pipeline handles them fine.
      objectUrl = URL.createObjectURL(file);
      const img = await loadImageElement(objectUrl);

      // Keep the canvas a sane size for large phone photos (faster + avoids
      // hitting browser canvas size limits on very large images).
      const MAX_DIM = 1600;
      const naturalWidth = img.naturalWidth || img.width;
      const naturalHeight = img.naturalHeight || img.height;
      if (!naturalWidth || !naturalHeight) throw new Error("Gambar kosong atau tidak valid.");
      const scale = Math.min(1, MAX_DIM / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);

      let rawValue = "";

      // 1) Try the native BarcodeDetector directly on the <img> (fast path).
      if ("BarcodeDetector" in window) {
        try {
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          const [result] = await detector.detect(img);
          rawValue = result?.rawValue || "";
        } catch {
          // Some browsers/images fail here too — fall through to jsQR below.
        }
      }

      // 2) Fallback (or double-check) using jsQR on the drawn canvas pixels.
      if (!rawValue) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
        rawValue = code?.data || "";
      }

      if (!rawValue) throw new Error("QR tidak ditemukan pada gambar. Pastikan QR terlihat jelas, tidak buram, dan tidak terpotong.");
      onDetectRef.current?.(normalizeScanValue(rawValue));
      onCloseRef.current?.();
    } catch (err) {
      toast.error(err.message || "Gagal membaca QR dari gambar. Coba foto lain atau gunakan input manual.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setFileLoading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-5 sm:space-y-0">
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-3">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ScanLine className="h-5 w-5" /></div>
              <div><p className="text-sm font-bold text-foreground">Arahkan ke QR Asset</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Posisikan QR di dalam bingkai. Kamu juga bisa memilih gambar QR dari galeri.</p></div>
            </div>
          </div>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-950 shadow-inner">
            {camOn ? (
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60">
                <Camera className="h-8 w-8" />
                <span className="text-xs">Kamera tidak tersedia — gunakan input manual</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-primary/80">
              <ScanLine className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-pulse text-primary" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={scanImageFile} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={fileLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-3 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.98] disabled:opacity-60">
              {fileLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /> : <ImageIcon className="h-4 w-4" />} {fileLoading ? "Membaca..." : "Pilih dari Galeri"}
            </button>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-3 text-[11px] font-medium text-muted-foreground"><Upload className="h-4 w-4" /> JPG, PNG, screenshot</div>
          </div>
          <div className="flex gap-2">
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Atau ketik kode QR/barcode..."
              className="flex-1 rounded-xl border bg-background px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            <button onClick={submit} className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-95">Cari</button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------ signature pad ----------------------------- */
export function SignaturePad({ onSave }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const pos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const start = (e) => {
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = pos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = pos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "hsl(222 47% 11%)";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };
  const save = () => {
    if (!hasDrawn) return toast.error("Buat tanda tangan terlebih dahulu.");
    onSave(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} width={320} height={160}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        className="w-full touch-none rounded-2xl border-2 border-dashed border-border bg-white" />
      <div className="flex gap-2">
        <button onClick={clear} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border bg-background py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted/40"><Eraser className="h-4 w-4" /> Hapus</button>
        <button onClick={save} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-105"><Check className="h-4 w-4" /> Simpan Tanda Tangan</button>
      </div>
    </div>
  );
}

/* -------------------------------- GPS button ------------------------------ */
export function GpsButton({ label = "Bagikan Lokasi Saya", targetCoords }) {
  const [loc, setLoc] = useState(null);
  const locate = () => {
    if (!navigator.geolocation) return toast.error("GPS tidak didukung perangkat ini.");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast.success("Lokasi ditemukan."); },
      () => toast.error("Gagal mengambil lokasi. Izinkan akses GPS.")
    );
  };
  const navigate = () => {
    const dest = targetCoords ? targetCoords.replace(" ", "") : loc ? `${loc.lat},${loc.lng}` : "";
    if (!dest) return locate();
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button onClick={locate} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border bg-background py-2.5 text-sm font-semibold transition hover:bg-muted/40">
        <MapPin className="h-4 w-4 text-primary" /> {loc ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : label}
      </button>
      {targetCoords && (
        <button onClick={navigate} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-105 sm:py-0">
          <Navigation className="h-4 w-4" /> Navigasi
        </button>
      )}
    </div>
  );
}

/* ------------------------------ photo capture ------------------------------ */
export function PhotoCapture({ photos = [], onAdd, onRemove }) {
  const inputRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const finish = (coords) => onAdd({ url: reader.result, at: new Date().toISOString(), coords });
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => finish(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
          () => finish(null)
        );
      } else finish(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <button onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-6 text-sm font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary active:scale-[0.99]">
        <Camera className="h-5 w-5 text-primary" /> Ambil Foto (before/during/after)
      </button>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p, i) => (
            <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              {onRemove && (
                <button onClick={() => onRemove(i)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                  <X className="h-3 w-3" />
                </button>
              )}
              {p.coords && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">GPS</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ offline indicator -------------------------- */
export function OfflineBadge({ offline }) {
  if (!offline) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--success))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--success))]">
      <Wifi className="h-3 w-3" /> Online
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--warning))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--warning))]">
      <WifiOff className="h-3 w-3" /> Mode Offline
    </span>
  );
}
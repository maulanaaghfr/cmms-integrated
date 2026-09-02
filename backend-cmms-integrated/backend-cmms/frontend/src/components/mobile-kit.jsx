import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, ScanLine, MapPin, Navigation, Eraser, Check, WifiOff, Wifi } from "lucide-react";
import { toast } from "sonner";

export const SLA_HOURS = { Critical: 4, High: 24, Medium: 72, Low: 168 };

/* ------------------------------ bottom sheet ----------------------------- */
export function Sheet({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-end bg-foreground/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "tween", duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-card p-4 pb-8 aitoma-scroll">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[s.tone]}`}>{s.label}</span>;
}

/* ------------------------------ barcode scanner --------------------------- */
export function ScannerSheet({ open, onClose, onDetect, title = "Scan Barcode" }) {
  const videoRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const onDetectRef = useRef(onDetect);
  const [manual, setManual] = useState("");
  const [camOn, setCamOn] = useState(false);
  const streamRef = useRef(null);

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
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"] });
          scanTimer = window.setInterval(async () => {
            if (!videoRef.current || !active) return;
            try {
              const [result] = await detector.detect(videoRef.current);
              if (result?.rawValue) {
                active = false;
                if (scanTimer) window.clearInterval(scanTimer);
                onDetectRef.current?.(result.rawValue.trim().toUpperCase());
                onCloseRef.current?.();
              }
            } catch { /* keep manual fallback available */ }
          }, 700);
        }
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
    onDetect(manual.trim().toUpperCase());
    setManual("");
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
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
        <div className="flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Ketik kode (mis. SP-101 / AST-1101)"
            className="flex-1 rounded-xl border bg-background px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          <button onClick={submit} className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground active:scale-95">Cari</button>
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
        <button onClick={clear} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border bg-background py-2.5 text-sm font-semibold text-muted-foreground"><Eraser className="h-4 w-4" /> Hapus</button>
        <button onClick={save} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"><Check className="h-4 w-4" /> Simpan Tanda Tangan</button>
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
    <div className="flex gap-2">
      <button onClick={locate} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border bg-background py-2.5 text-sm font-semibold">
        <MapPin className="h-4 w-4 text-primary" /> {loc ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : label}
      </button>
      {targetCoords && (
        <button onClick={navigate} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
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
      <button onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-6 text-sm font-semibold text-muted-foreground active:scale-[0.99]">
        <Camera className="h-5 w-5 text-primary" /> Ambil Foto (before/during/after)
      </button>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
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

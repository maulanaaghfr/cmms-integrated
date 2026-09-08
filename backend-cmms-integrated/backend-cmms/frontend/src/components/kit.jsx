import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, AlertTriangle } from "lucide-react";
import JsBarcode from "jsbarcode";

/* ------------------------------- buttons ------------------------------- */
export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110",
    ghost: "border bg-background text-foreground hover:bg-muted",
    outline: "border border-primary/30 bg-transparent text-primary hover:bg-primary/5",
    danger: "bg-destructive text-destructive-foreground hover:brightness-110",
    accent: "bg-accent text-accent-foreground hover:brightness-110",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

/* -------------------------------- card --------------------------------- */
export function Card({ children, className = "" }) {
  return (
    <div className={`soft-card rounded-xl border border-border/80 bg-card p-4 lg:p-5 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-lg font-extrabold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Reveal({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------- pill --------------------------------- */
export function Pill({ children, tone = "primary", className = "" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
    danger: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function statusTone(s) {
  const map = {
    // One shared status mapping for the application. Keep labels visible in
    // every caller; this helper supplies colour only.
    Draft: "muted", Open: "primary", "Pending Approval": "warning", Assigned: "warning", "Waiting Verification": "warning",
    "In Progress": "accent", Provisioning: "accent",
    "On Hold": "warning",
    Operational: "success", Completed: "success", Verified: "success", Closed: "success", Paid: "success", Ready: "success", Active: "success", OK: "success",
    Rejected: "danger", Cancelled: "danger", Failed: "danger", Overdue: "danger", Down: "danger", Critical: "danger",
    Archived: "muted", Expired: "muted", Inactive: "muted",
    "Needs Attention": "warning", Low: "warning", Trial: "warning", "Past Due": "warning",
  };
  return map[s] || "primary";
}
export function priorityTone(p) {
  return { Critical: "danger", High: "warning", Medium: "accent", Low: "muted" }[p] || "muted";
}

export function HealthBar({ value }) {
  const color = value >= 80 ? "bg-[hsl(var(--success))]" : value >= 55 ? "bg-[hsl(var(--warning))]" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

/* -------------------------------- modal -------------------------------- */
export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={`my-auto w-full ${wide ? "max-w-2xl" : "max-w-[460px]"} rounded-2xl border bg-card shadow-2xl`}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto px-5 py-4 aitoma-scroll">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Hapus", confirmDisabled = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || "Konfirmasi"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={confirmDisabled}>Batal</Button>
          <Button variant="danger" onClick={onConfirm} disabled={confirmDisabled}>{confirmDisabled ? "Menghapus..." : confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </Modal>
  );
}

/* -------------------------------- form --------------------------------- */
export function Field({ label, children, required }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Input(props) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}
export function Select({ children, ...props }) {
  const hideRedundantStatusSelect = String(props.className || "").includes("ml-auto");
  return <select {...props} className={`${inputCls} ${props.className || ""} ${hideRedundantStatusSelect ? "hidden" : ""}`}>{children}</select>;
}
export function Textarea(props) {
  return <textarea {...props} className={`${inputCls} ${props.className || ""}`} />;
}

/* -------------------------------- search ------------------------------- */
export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Cari..."}
        className={`${inputCls} pl-9`}
      />
    </div>
  );
}

/* -------------------------------- table -------------------------------- */
export function Table({ columns, rows, empty, onRowClick, rowKey = "id" }) {
  return (
    <div className="overflow-x-auto aitoma-scroll">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b text-left">
            {columns.map((c) => (
              <th key={c.key} className="bg-muted/30 px-3 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-muted-foreground">
                {empty || "Tidak ada data."}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-border/60 transition last:border-0 ${onRowClick ? "cursor-pointer hover:bg-muted/60" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-3.5 align-middle text-foreground">
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- tabs --------------------------------- */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            active === t.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/80 text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- condition stars --------------------------- */
export function Stars({ value = 0, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={`text-lg leading-none transition ${onChange ? "cursor-pointer hover:scale-110" : "cursor-default"} ${
            n <= value ? "text-[hsl(var(--warning))]" : "text-muted-foreground/30"
          }`}
          aria-label={`${n} of 5`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ tag chip ------------------------------- */
export function Tag({ children }) {
  return (
    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      #{children}
    </span>
  );
}

/* ---------------------- deterministic QR-style code -------------------- */
export function QRCode({ value = "", size = 132 }) {
  const cells = 21;
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  const rng = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; };
  const grid = [];
  for (let y = 0; y < cells; y++) {
    const row = [];
    for (let x = 0; x < cells; x++) {
      const finder = (gx, gy) => gx < 7 && gy < 7;
      const isFinder = finder(x, y) || finder(cells - 1 - x, y) || finder(x, cells - 1 - y);
      if (isFinder) {
        const lx = x >= cells - 7 ? x - (cells - 7) : x;
        const ly = y >= cells - 7 ? y - (cells - 7) : y;
        const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6;
        const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
        row.push(ring || core ? 1 : 0);
      } else {
        row.push(rng() > 0.5 ? 1 : 0);
      }
    }
    grid.push(row);
  }
  const unit = size / cells;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-lg bg-white p-1 shadow-sm">
      {grid.map((row, y) =>
        row.map((c, x) =>
          c ? <rect key={`${x}-${y}`} x={x * unit} y={y * unit} width={unit} height={unit} fill="hsl(222 47% 11%)" /> : null
        )
      )}
    </svg>
  );
}

/* ---------------------------- scannable barcode ------------------------- */
export function Barcode({ value, height = 48, width = 1.25, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      displayValue: true,
      fontSize: 11,
      height,
      margin: 4,
      width,
      lineColor: "#0f172a",
      background: "#ffffff",
    });
  }, [value, height, width]);

  return value ? <svg ref={ref} className={`max-w-full rounded bg-white ${className}`} aria-label={`Barcode ${value}`} /> : null;
}

/* -------------------------------- stat --------------------------------- */
export function StatCard({ icon: Icon, label, value, delta, tone = "primary", hint }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  };
  return (
    <Card className="flex min-h-[112px] flex-col justify-between">
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          {Icon && <Icon className="h-4 w-4" />}
        </div>
      </div>
      <div>
        <div className="font-display text-xl font-extrabold tracking-tight text-foreground">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground/70">{hint}</div>}
        {delta && <span className="text-xs font-semibold text-[hsl(var(--success))]">{delta}</span>}
      </div>
    </Card>
  );
}
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

export function AssetQr({ value, size = 180, className = "" }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value || "", { width: size, margin: 1, errorCorrectionLevel: "M" }).then((url) => alive && setSrc(url));
    return () => { alive = false; };
  }, [value, size]);
  return src ? <img src={src} alt="QR Asset" width={size} height={size} className={className} /> : <div className={`grid place-items-center bg-muted text-xs text-muted-foreground ${className}`} style={{ width: size, height: size }}>Membuat QR...</div>;
}

export async function printAssetQrLabel({ value, title, code }) {
  const image = await QRCode.toDataURL(value || "", { width: 600, margin: 2, errorCorrectionLevel: "H" });
  const safe = (input) => String(input || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const popup = window.open("", "_blank", "width=820,height=980");
  if (!popup) return false;
  popup.document.write(`<html><head><title>QR Asset ${safe(code || title)}</title><style>@page{size:80mm 80mm;margin:0}*{box-sizing:border-box}html,body{width:80mm;height:80mm;margin:0;padding:0;background:#fff}body{font-family:Arial,sans-serif}.sheet{width:80mm;height:80mm;display:flex;align-items:center;justify-content:center}.qr-label{width:80mm;height:80mm;aspect-ratio:1/1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5mm;padding:4mm;text-align:center;border:0.35mm solid #222;background:#fff}.qr-label img{display:block;width:54mm;height:54mm;aspect-ratio:1/1;object-fit:contain;flex:none}.qr-label h2{width:70mm;margin:0;font-size:11pt;line-height:1.1;font-weight:700;overflow-wrap:anywhere;word-break:break-word}.qr-label p{width:70mm;margin:0;font-size:8.5pt;line-height:1.1;font-family:monospace;overflow-wrap:anywhere;word-break:break-word}@media print{html,body,.sheet{width:80mm;height:80mm}.qr-label{break-inside:avoid}}</style></head><body><main class="sheet"><div class="qr-label"><img src="${image}" alt="QR Asset"/><h2>${safe(title || "Asset")}</h2><p>${safe(code)}</p></div></main><script>window.onload=()=>{window.print();}</script></body></html>`);
  popup.document.close();
  return true;
}

/**
 * Downloads the asset QR as a real .png file directly (no print dialog
 * involved). This avoids the common mistake of using the browser's print
 * popup with "Save as PDF" and manually renaming the result to .png, which
 * produces a file that LOOKS like a PNG by name but is actually a PDF and
 * cannot be decoded by any image reader/scanner.
 */
export async function downloadAssetQrImage({ value, code, title }) {
  const image = await QRCode.toDataURL(value || "", { width: 900, margin: 2, errorCorrectionLevel: "H" });
  const link = document.createElement("a");
  const safeName = String(code || title || "asset-qr").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  link.href = image;
  link.download = `qr-${safeName || "asset"}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function printBarcodeLabel({ value, title, code, unit }) {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, { format: "CODE128", width: 2, height: 70, displayValue: true, margin: 8 });
  const image = canvas.toDataURL("image/png");
  const popup = window.open("", "_blank", "width=480,height=360");
  if (!popup) return false;
  popup.document.write(`<html><head><title>Label ${title || value}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}.label{border:1px solid #111;padding:18px;display:inline-block;min-width:280px}img{max-width:100%}h2{font-size:18px;margin:0 0 8px}p{margin:4px 0;font-size:12px}</style></head><body><div class="label"><h2>${String(title || "Spare Part").replaceAll("<", "&lt;")}</h2><p>${String(code || "").replaceAll("<", "&lt;")} ${String(unit || "").replaceAll("<", "&lt;")}</p><img src="${image}" alt="Barcode"/><p>${String(value).replaceAll("<", "&lt;")}</p></div><script>window.onload=()=>{window.print();}</script></body></html>`);
  popup.document.close();
  return true;
}
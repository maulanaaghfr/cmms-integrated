import { useEffect, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

export function AssetQr({ value, size = 180, className = "" }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value || "", { width: size, margin: 4, errorCorrectionLevel: "M" }).then((url) => alive && setSrc(url));
    return () => { alive = false; };
  }, [value, size]);
  return src ? <img src={src} alt="QR Asset" width={size} height={size} className={className} /> : <div className={`grid place-items-center bg-muted text-xs text-muted-foreground ${className}`} style={{ width: size, height: size }}>Membuat QR...</div>;
}

function safeFileName(name) {
  return String(name || "qr").trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "qr";
}

function triggerDownload(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadAssetQr({ value, code, format = "png" }) {
  const safeName = safeFileName(code);
  if (format === "svg") {
    const svgString = await QRCode.toString(value || "", { type: "svg", width: 400, margin: 4, errorCorrectionLevel: "M" });
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    triggerDownload(URL.createObjectURL(blob), `${safeName}-qr.svg`);
    return;
  }
  const pngUrl = await QRCode.toDataURL(value || "", { width: 400, margin: 4, errorCorrectionLevel: "M" });
  if (format === "png") {
    triggerDownload(pngUrl, `${safeName}-qr.png`);
    return;
  }
  // jpg: gambar ulang di atas kanvas putih karena JPG tidak mendukung transparansi
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = pngUrl; });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  triggerDownload(canvas.toDataURL("image/jpeg", 1), `${safeName}-qr.jpg`);
}

function createBarcodeImage(value) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) return null;

  const canvas = document.createElement("canvas");
  JsBarcode(canvas, normalizedValue, {
    format: "CODE128",
    width: 3,
    height: 120,
    displayValue: true,
    fontSize: 28,
    margin: 16,
    lineColor: "#111827",
    background: "#ffffff",
  });
  return { image: canvas.toDataURL("image/png"), value: normalizedValue };
}

export function downloadBarcodeLabel({ value, code }) {
  const barcode = createBarcodeImage(value);
  if (!barcode) return false;

  const safeName = String(code || barcode.value)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "barcode";
  const link = document.createElement("a");
  link.href = barcode.image;
  link.download = `${safeName}-barcode.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export function printBarcodeLabel({ value, title, code, unit }) {
  const barcode = createBarcodeImage(value);
  if (!barcode) return false;
  const { image, value: normalizedValue } = barcode;
  const popup = window.open("", "_blank", "width=480,height=360");
  if (!popup) return false;

  const safeTitle = String(title || "Spare Part").replaceAll("<", "&lt;");
  const safeCode = String(code || "").replaceAll("<", "&lt;");
  const safeUnit = String(unit || "").replaceAll("<", "&lt;");
  const safeValue = normalizedValue.replaceAll("<", "&lt;");

  popup.document.write(`<html><head><title>Label ${safeTitle}</title><style>
    @page { size: 50mm 30mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 50mm; height: 30mm; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; color: #111; }
    .label { width: 50mm; height: 30mm; padding: 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
    h2 { max-width: 46mm; margin: 0 0 0.8mm; font-size: 3.2mm; line-height: 1.1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta, .value { max-width: 46mm; margin: 0; font-size: 2.4mm; line-height: 1.1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    img { display: block; width: 46mm; height: 19mm; object-fit: contain; image-rendering: auto; margin: 0.8mm 0; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body><div class="label"><h2>${safeTitle}</h2><p class="meta">${safeCode} ${safeUnit}</p><img src="${image}" alt="Barcode"/><p class="value">${safeValue}</p></div><script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
  popup.document.close();
  return true;
}


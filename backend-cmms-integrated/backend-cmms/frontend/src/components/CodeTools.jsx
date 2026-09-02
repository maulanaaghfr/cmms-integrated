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

import React, { useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Printer, Download } from "lucide-react";
import { Card, Button } from "./kit";

export default function AssetQrLabel({ asset, onPrint }) {
  const value = `${window.location.origin}/assets/${asset.id}`;
  const canvasWrapRef = useRef(null);
  const svgWrapRef = useRef(null);

  const downloadFile = (href, filename) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadRaster = (type) => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const mime = type === "jpg" ? "image/jpeg" : "image/png";
    let source = canvas;
    if (type === "jpg") {
      // JPG tidak mendukung transparansi; gambar ulang di atas latar putih.
      const flattened = document.createElement("canvas");
      flattened.width = canvas.width;
      flattened.height = canvas.height;
      const ctx = flattened.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, flattened.width, flattened.height);
      ctx.drawImage(canvas, 0, 0);
      source = flattened;
    }
    downloadFile(source.toDataURL(mime, 1), `qr-${asset.code || asset.id}.${type}`);
  };

  const downloadSvg = () => {
    const svg = svgWrapRef.current?.querySelector("svg");
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml" });
    downloadFile(URL.createObjectURL(blob), `qr-${asset.code || asset.id}.svg`);
  };

  return <Card className="print-label flex flex-col items-center p-5 text-center">
    <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">AITOMA CMMS · SCAN ASSET</div>
    <div ref={canvasWrapRef}><QRCodeCanvas value={value} size={190} includeMargin level="H" /></div>
    <div ref={svgWrapRef} className="hidden"><QRCodeSVG value={value} size={190} includeMargin level="H" /></div>
    <div className="mt-3 font-display text-lg font-extrabold">{asset.name}</div>
    <div className="font-mono text-xs text-muted-foreground">{asset.code}</div>
    <div className="mt-2 max-w-[240px] break-all text-[10px] text-muted-foreground">{value}</div>
    <div className="mt-4 flex flex-wrap justify-center gap-2 print-hide">
      <Button variant="outline" onClick={onPrint}><Printer className="h-4 w-4" /> Print Label</Button>
      <Button variant="outline" onClick={() => downloadRaster("png")}><Download className="h-4 w-4" /> PNG</Button>
      <Button variant="outline" onClick={() => downloadRaster("jpg")}><Download className="h-4 w-4" /> JPG</Button>
      <Button variant="outline" onClick={downloadSvg}><Download className="h-4 w-4" /> SVG</Button>
    </div>
  </Card>;
}

import { Download, Printer, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Card, Button } from "./kit";
import { AssetQr, printAssetQrLabel, downloadAssetQrImage } from "./CodeTools";

/**
 * Sidebar card shown on the Asset Detail page (src/pages/AssetDetail.jsx).
 * Renders the QR that, when scanned, brings a technician straight back to
 * this same page: /assets/:assetId.
 */
export default function AssetQrLabel({ asset }) {
  if (!asset) return null;

  const qrValue = `${window.location.origin}/assets/${asset.id}`;

  const handleDownload = async () => {
    try {
      await downloadAssetQrImage({ value: qrValue, title: asset.name, code: asset.code });
    } catch (err) {
      toast.error(err.message || "Gagal mengunduh QR.");
    }
  };

  const handlePrint = async () => {
    try {
      const opened = await printAssetQrLabel({ value: qrValue, title: asset.name, code: asset.code });
      if (opened === false) toast.error("Popup diblokir browser. Izinkan popup untuk mencetak label.");
    } catch (err) {
      toast.error(err.message || "Gagal membuka label cetak.");
    }
  };

  return (
    <Card className="flex flex-col items-center gap-3 text-center">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <ScanLine className="h-4 w-4 text-primary" /> QR Asset / Mesin
      </div>
      <AssetQr value={qrValue} size={180} />
      <div>
        <p className="font-mono text-xs text-muted-foreground">{asset.code}</p>
        <p className="mt-1 text-xs text-muted-foreground">Scan QR ini untuk langsung membuka halaman aset ini dari lapangan.</p>
      </div>
      <div className="mt-1 flex w-full flex-col gap-2">
        <Button variant="outline" className="w-full" onClick={handleDownload}>
          <Download className="h-4 w-4" /> Download PNG
        </Button>
        <Button variant="ghost" className="w-full" onClick={handlePrint}>
          <Printer className="h-4 w-4" /> Print QR 1:1
        </Button>
      </div>
    </Card>
  );
}
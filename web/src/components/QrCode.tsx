import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders a value as a scannable QR code (white-backed so any theme scans). */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src) return null;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="Pairing QR code"
      style={{ borderRadius: 10, background: "#fff", padding: 10, display: "block" }}
    />
  );
}

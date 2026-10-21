import { useMemo } from "react";
import { encode } from "uqr";

interface Props {
  value: string;
  label: string;
  size?: number;
}

/** QR code as one SVG path. Dark modules on a light tile, since phone cameras expect that contrast. */
export function QrCode({ value, label, size = 208 }: Props) {
  const { path, modules } = useMemo(() => {
    // Medium error correction and the standard 4-module quiet zone, so it scans off a laptop screen.
    const qr = encode(value, { ecc: "M", border: 4 });
    let d = "";
    qr.data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, modules: qr.size };
  }, [value]);

  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
    >
      <rect className="qr__tile" width={modules} height={modules} />
      <path className="qr__modules" d={path} />
    </svg>
  );
}

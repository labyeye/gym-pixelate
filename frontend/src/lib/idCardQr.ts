import QRCode from "qrcode";

/** data: URL of a QR code for `value` (cached), or "" when it can't be built. */
const cache = new Map<string, string>();
export async function qrDataUrl(value: string): Promise<string> {
  if (!value) return "";
  const hit = cache.get(value);
  if (hit) return hit;
  try {
    const url = await QRCode.toDataURL(value, {
      margin: 0,
      errorCorrectionLevel: "M",
      width: 320,
      color: { dark: "#000000", light: "#ffffff" },
    });
    cache.set(value, url);
    return url;
  } catch {
    return "";
  }
}

/** QR images for many values at once, keyed by value. */
export async function buildQrMap(values: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    [...new Set(values.filter(Boolean))].map(async (v) => {
      out[v] = await qrDataUrl(v);
    }),
  );
  return out;
}

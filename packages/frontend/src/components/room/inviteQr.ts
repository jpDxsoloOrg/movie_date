/**
 * An SVG data URL rather than a canvas: it stays sharp at any size, renders in a
 * plain <img>, and qrcode only loads when someone asks for the code.
 */
export async function inviteQrDataUrl(link: string): Promise<string> {
  const qrcode = await import("qrcode");
  const svg = await qrcode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

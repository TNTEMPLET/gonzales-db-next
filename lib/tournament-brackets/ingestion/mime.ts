/** Guess MIME when `File.type` is empty (common for drag-and-drop). */
export function inferMimeFromFilename(filename: string): string {
  const ext = filename.includes(".") ? (filename.split(".").pop()?.toLowerCase() ?? "") : "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    jfif: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
  };
  return map[ext] ?? "";
}

export function normalizeClientMime(mime: string, filename: string): string {
  const raw = mime.trim().toLowerCase();
  const unusable =
    !raw ||
    raw === "application/octet-stream" ||
    raw === "binary/octet-stream" ||
    raw === "application/x-download";
  if (!unusable) {
    if (raw === "image/jpg" || raw === "image/pjpeg" || raw === "image/x-citrix-jpeg") return "image/jpeg";
    return raw;
  }
  return inferMimeFromFilename(filename).toLowerCase();
}

/** First bytes when browsers send wrong or empty Content-Type (esp. some JPG exports). */
export function sniffMimeFromBuffer(buffer: ArrayBuffer): string | null {
  const u = new Uint8Array(buffer.byteLength < 32 ? buffer : buffer.slice(0, 32));
  if (u.length < 4) return null;
  if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return "image/jpeg";
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return "image/png";
  if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x38) return "image/gif";
  if (
    u.length >= 12 &&
    u[0] === 0x52 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x46 &&
    u[8] === 0x57 &&
    u[9] === 0x45 &&
    u[10] === 0x42 &&
    u[11] === 0x50
  ) {
    return "image/webp";
  }
  if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) return "application/pdf";
  if (u[0] === 0x50 && u[1] === 0x4b && u[2] === 0x03 && u[3] === 0x04) return "application/zip";
  return null;
}

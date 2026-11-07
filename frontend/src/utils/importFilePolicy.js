const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/heic', 'image/heif', 'image/avif']);

export async function inspectImportFiles(files) {
  const accepted = [], refused = [];
  for (const file of Array.from(files || [])) {
    const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const text = String.fromCharCode(...bytes);
    // HEIC/HEIF and AVIF pass on their bytes alone: the server decodes them and
    // stores a lossless PNG. A filename or MIME label never admits a file.
    const converted = text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1|avif|avis/.test(text.slice(8));
    const supported = converted || (bytes[0] === 0xff && bytes[1] === 0xd8)
      || (bytes[0] === 137 && text.slice(1, 4) === 'PNG')
      || (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')
      || text.startsWith('BM');
    // Some phone pickers convert the bytes but retain the original filename
    // or MIME hint. The supported decoded signature wins over those labels.
    if (!supported) {
      refused.push({ name: file.name, reason:
        `Unsupported image${SUPPORTED.has(file.type) ? ' data' : ' format'}: select JPEG, PNG, WebP, BMP, HEIC or AVIF.` });
    } else accepted.push(file);
  }
  return { accepted, refused };
}

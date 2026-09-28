const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);

export async function inspectImportFiles(files) {
  const accepted = [], refused = [];
  for (const file of Array.from(files || [])) {
    const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const text = String.fromCharCode(...bytes);
    const heif = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)
      || (text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8)));
    const supported = (bytes[0] === 0xff && bytes[1] === 0xd8)
      || (bytes[0] === 137 && text.slice(1, 4) === 'PNG')
      || (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')
      || text.startsWith('BM');
    // Some phone pickers convert the bytes but retain the original filename
    // or MIME hint. The supported decoded signature wins over those labels.
    if (!supported) {
      refused.push({ name: file.name, reason: heif
        ? 'HEIC/HEIF: export as JPEG or PNG, then select the converted file.'
        : `Unsupported image${SUPPORTED.has(file.type) ? ' data' : ' format'}: select JPEG, PNG, WebP or BMP.` });
    } else accepted.push(file);
  }
  return { accepted, refused };
}

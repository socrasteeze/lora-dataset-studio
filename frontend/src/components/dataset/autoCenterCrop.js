/** Fit a detected subject without cutting it or inventing pixels at the edges. */
export function autoCenterCrop(bounds, width, height, aspect = null) {
  if (!Array.isArray(bounds) || bounds.length !== 4
      || bounds.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
      || (aspect != null && (!Number.isFinite(aspect) || aspect <= 0))) {
    throw new Error('The subject bounds are invalid. Adjust the crop manually.');
  }
  const [x1, y1, x2, y2] = bounds;
  if (x2 <= x1 || y2 <= y1) throw new Error('The subject bounds are empty. Adjust the crop manually.');
  const subjectW = (x2 - x1) * width;
  const subjectH = (y2 - y1) * height;
  const cx = (x1 + x2) * width / 2;
  const cy = (y1 + y2) * height / 2;
  let w = Math.min(width, Math.max(32, subjectW * 1.2));
  let h = Math.min(height, Math.max(32, subjectH * 1.2));
  if (aspect != null) {
    w = Math.max(w, h * aspect);
    h = w / aspect;
    const scale = Math.min(1, width / w, height / h);
    w *= scale; h *= scale;
    if (w + 0.01 < subjectW || h + 0.01 < subjectH) {
      throw new Error('This ratio would cut the subject. Choose Free or another ratio.');
    }
  }
  const x = Math.max(0, Math.min(width - w, cx - w / 2));
  const y = Math.max(0, Math.min(height - h, cy - h / 2));
  return {
    box: { x, y, w, h },
    edgeLimited: Math.abs(x + w / 2 - cx) > 1 || Math.abs(y + h / 2 - cy) > 1,
  };
}

/** The model receives only a bounded, upright, metadata-free preview. */
export async function cropPreviewBlob(image) {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) {
    throw new Error('Wait for the image to load.');
  }
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not prepare this image.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('The image preview could not be prepared.')),
    'image/jpeg', 0.9,
  ));
}

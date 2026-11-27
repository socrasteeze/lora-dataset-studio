export const MIN_SIDE = 32;

export function clampBox(b, W, H) {
  const w = Math.min(Math.max(b.w, MIN_SIDE), W);
  const h = Math.min(Math.max(b.h, MIN_SIDE), H);
  return { x: Math.min(Math.max(b.x, 0), W - w), y: Math.min(Math.max(b.y, 0), H - h), w, h };
}

export function readCropSourceSize(header) {
  const match = /^(\d+)x(\d+)$/.exec(header);
  if (!match) return null;
  const W = Number(match[1]);
  const H = Number(match[2]);
  return Number.isSafeInteger(W) && W > 0 && Number.isSafeInteger(H) && H > 0 ? { W, H } : null;
}

export function cropDisplayBox(box, { W, H }) {
  return { left: box.x / W, top: box.y / H, width: box.w / W, height: box.h / H };
}

export function dragCropBox(drag, clientX, clientY, { W, H }, ratio) {
  const { edges, start, sx, sy, width, height } = drag;
  const dx = (clientX - sx) * W / width;
  const dy = (clientY - sy) * H / height;
  if (!edges) return clampBox({ ...start, x: start.x + dx, y: start.y + dy }, W, H);

  let x1 = start.x, y1 = start.y, x2 = start.x + start.w, y2 = start.y + start.h;
  if (edges.left) x1 = Math.min(Math.max(0, x1 + dx), x2 - MIN_SIDE);
  if (edges.right) x2 = Math.max(Math.min(W, x2 + dx), x1 + MIN_SIDE);
  if (edges.top) y1 = Math.min(Math.max(0, y1 + dy), y2 - MIN_SIDE);
  if (edges.bottom) y2 = Math.max(Math.min(H, y2 + dy), y1 + MIN_SIDE);
  const box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  const horiz = !!(edges.left || edges.right);
  const vert = !!(edges.top || edges.bottom);
  if (ratio && horiz !== vert) {
    // The other dimension grows around the center of an edge drag.
    if (horiz) {
      box.h = Math.min(box.w / ratio, H); box.w = box.h * ratio;
      if (edges.left) box.x = x2 - box.w;
      box.y = start.y + start.h / 2 - box.h / 2;
    } else {
      box.w = Math.min(box.h * ratio, W); box.h = box.w / ratio;
      if (edges.top) box.y = y2 - box.h;
      box.x = start.x + start.w / 2 - box.w / 2;
    }
  } else if (ratio) {
    // Follow the dominant axis and anchor the opposite corner.
    if (Math.abs(dx) >= Math.abs(dy)) box.h = box.w / ratio;
    else box.w = box.h * ratio;
    if (edges.left) box.x = x2 - box.w;
    if (edges.top) box.y = y2 - box.h;
    if (box.x < 0) { box.w += box.x; box.h = box.w / ratio; box.x = 0; if (edges.top) box.y = y2 - box.h; }
    if (box.y < 0) { box.h += box.y; box.w = box.h * ratio; box.y = 0; if (edges.left) box.x = x2 - box.w; }
    if (box.x + box.w > W) { box.w = W - box.x; box.h = box.w / ratio; if (edges.top) box.y = y2 - box.h; }
    if (box.y + box.h > H) { box.h = H - box.y; box.w = box.h * ratio; if (edges.left) box.x = x2 - box.w; }
  }
  return clampBox(box, W, H);
}

export function roundCropBox({ x, y, w, h }) {
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

"""Every-face extraction for identity enrollment; never choose the biggest face."""
from __future__ import annotations

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
from infer_io import claim_result_stream

_OUT = claim_result_stream(__name__)


def main():
    os.environ['CUDA_VISIBLE_DEVICES'] = ''
    try:
        payload = json.load(sys.stdin)
        items = payload['items']
        if not isinstance(items, list) or not 1 <= len(items) <= 64:
            raise ValueError('invalid batch')
        import numpy as np
        from PIL import Image, ImageOps
        from insightface.app import FaceAnalysis
        from face_score_infer import _repair_nested_antelopev2, _verdict
        root = payload['models_root']
        _repair_nested_antelopev2(root)
        # Parent checks the complete prepared pack. Worker also refuses missing
        # recognition/detection weights before FaceAnalysis can fetch anything.
        folder = os.path.join(root, 'models', 'antelopev2')
        if not all(os.path.isfile(os.path.join(folder, name)) for name in (
                'glintr100.onnx', 'scrfd_10g_bnkps.onnx')):
            raise ValueError('missing prepared weights')
        analyzer = FaceAnalysis(name='antelopev2', root=root,
                                providers=['CPUExecutionProvider'])
        analyzer.prepare(ctx_id=-1, det_size=(640, 640))
    except Exception:
        json.dump({'ok': False, 'error': 'Face recognition is unavailable.'}, _OUT)
        return 1
    results = []
    for item in items:
        try:
            with Image.open(item['path']) as raw:
                if raw.width*raw.height > 64*1024*1024:
                    results.append({'state': 'too_large', 'subjects': []})
                    continue
                image = ImageOps.exif_transpose(raw).convert('RGB')
            width, height = image.size
            selection = item.get('region') or [0.0, 0.0, 1.0, 1.0]
            x, y, w, h = selection
            crop = image.crop((round(x*width), round(y*height),
                               round((x+w)*width), round((y+h)*height)))
            faces = analyzer.get(np.asarray(crop)[:, :, ::-1].copy())
            if len(faces) > 32:
                results.append({'state': 'too_many_faces', 'subjects': []})
                continue
            subjects = []
            for face in faces:
                x1, y1, x2, y2 = map(float, face.bbox)
                yaw = float(face.pose[1]) if getattr(face, 'pose', None) is not None else float('nan')
                if _verdict(float(face.det_score), min(x2-x1, y2-y1), yaw) != 'scorable':
                    continue
                left = max(0.0, x + x1/width)
                top = max(0.0, y + y1/height)
                right = min(1.0, x + x2/width)
                bottom = min(1.0, y + y2/height)
                if right <= left or bottom <= top:
                    continue
                subjects.append({'region': [left, top, right-left, bottom-top],
                                 'vector': face.normed_embedding.tolist()})
            results.append({'state': 'measured' if subjects else 'no_usable_face',
                            'subjects': subjects})
        except Exception:
            results.append({'state': 'unreadable', 'subjects': []})
    json.dump({'ok': True, 'results': results}, _OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())

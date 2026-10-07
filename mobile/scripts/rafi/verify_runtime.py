"""Decode every shipped frame; compare temporal order and opaque material to the certified source.
Software evidence only. Android FPS/CPU/GPU/heap require the final physical APK.
Run from mobile: python scripts/rafi/verify_runtime.py [report.json]
"""
import hashlib
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
assets = root / 'assets/rafi/master-loop-v1'
source = root / 'docs/w6/pb1-final-correction/RAFI_MASTER_LOOP_V1.mp4'
manifest = json.loads((assets / 'manifest.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest['source_sha256']
capture = cv2.VideoCapture(str(source))
assert capture.get(cv2.CAP_PROP_FRAME_COUNT) == 217
assert capture.get(cv2.CAP_PROP_FPS) == 24
streams = {name: Image.open(assets / f'rafi-{name}.webp') for name in manifest['variants']}
results = {}
for name, stream in streams.items():
    size = manifest['variants'][name]
    assert stream.size == (size, size) and stream.n_frames == 217 and stream.info['loop'] == 0
    y, x = np.mgrid[:size, :size]
    radius = np.hypot(x - size / 2, y - size * 734 / 1440)
    results[name] = {'size': size, 'errors': [], 'durations': [], 'core': radius < size * 390 / 1440,
                     'source_motion': [], 'runtime_motion': [], 'alpha_centers': [], 'last': None, 'first': None}
start = time.perf_counter()
for frame in range(217):
    ok, bgr = capture.read()
    assert ok
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    for name, stream in streams.items():
        r = results[name]
        stream.seek(frame)
        rgba = np.array(stream.convert('RGBA'))
        r['durations'].append(stream.info['duration'])
        alpha = rgba[:, :, 3]
        assert alpha[r['core']].min() == 255, (name, frame, 'black core must stay opaque')
        assert max(alpha[0].max(), alpha[-1].max(), alpha[:, 0].max(), alpha[:, -1].max()) == 0
        assert np.any((alpha > 0) & (alpha < 255)), 'soft contour/halo must survive'
        reference = cv2.resize(rgb, (r['size'], r['size']), interpolation=cv2.INTER_AREA).astype(float)
        if name == 'mini':
            reference = np.clip(reference * 1.08, 0, 255)
        decoded = rgba[:, :, :3].astype(float)
        r['errors'].append(float(np.abs(decoded - reference)[r['core']].mean()))
        y, x = np.nonzero(alpha > 250)
        r['alpha_centers'].append([float(x.mean()), float(y.mean())])
        current = (reference[r['core']], decoded[r['core']])
        if r['last'] is not None:
            r['source_motion'].append(float(np.abs(current[0] - r['last'][0]).mean()))
            r['runtime_motion'].append(float(np.abs(current[1] - r['last'][1]).mean()))
        else:
            r['first'] = current
        r['last'] = current
capture.release()
report = {'source_sha256': manifest['source_sha256'], 'frames': 217, 'source_fps': 24,
          'source_seconds': 217 / 24, 'device_performance': 'PHYSICAL RE-CERTIFICATION REQUIRED', 'variants': {}}
for name, r in results.items():
    assert r['durations'] == manifest['frame_delays_ms'], 'no retiming or dropped frames'
    assert max(r['errors']) < 7, (name, 'material/frame-order fidelity', max(r['errors']))
    correlation = float(np.corrcoef(r['source_motion'], r['runtime_motion'])[0, 1])
    assert correlation > .94, (name, 'motion cadence preservation', correlation)
    drift = float(np.linalg.norm(np.ptp(r['alpha_centers'], axis=0)))
    assert drift < r['size'] * .02, (name, 'matte center stability', drift)
    boundary = [float(np.abs(r['last'][i] - r['first'][i]).mean()) for i in [0, 1]]
    assert abs(boundary[0] - boundary[1]) < 3, (name, 'no added boundary flash')
    report['variants'][name] = {
        'resolution': [r['size'], r['size']], 'frames': 217, 'duration_ms': sum(r['durations']),
        'alpha': True, 'opaque_core': True, 'transparent_border': True,
        'max_core_rgb_mae_255': max(r['errors']), 'motion_delta_correlation': correlation,
        'matte_center_range_pixels': drift, 'boundary_delta_source_runtime': boundary,
        'file_bytes': (assets / f'rafi-{name}.webp').stat().st_size,
        'one_rgba_frame_bytes': r['size'] ** 2 * 4,
        'all_frames_uncompressed_bytes_for_comparison_only': r['size'] ** 2 * 4 * 217,
    }
report['host_decode_seconds_not_android_fps'] = time.perf_counter() - start
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))

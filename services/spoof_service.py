import os
import cv2
import numpy as np
import onnxruntime as ort
from functools import lru_cache
from core.config import get_settings

MODEL_PATH = "anti_spoof_model/minifasnet_v2.onnx"

@lru_cache(maxsize=1)
def get_spoof_session() -> ort.InferenceSession:
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Anti-spoof model not found at {MODEL_PATH}.\n"
            f"Files in anti_spoof_model/: {os.listdir('anti_spoof_model') if os.path.exists('anti_spoof_model') else 'directory missing'}"
            "Download from: https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx"
        )
    opts = ort.SessionOptions()
    # Small model — 2 threads is sufficient and leaves CPU headroom
    # for det_2.5g which runs every frame
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    return ort.InferenceSession(
        MODEL_PATH,
        sess_options=opts,
        providers=["CPUExecutionProvider"],
    )

def _expand_crop(frame: np.ndarray, bbox: np.ndarray, scale: float = 2.7) -> np.ndarray:
    """
    Expand the detector bbox by scale factor, centered on the face.
    Handles out-of-bounds cases with zero-padding to maintain the 1:1
    aspect ratio the anti-spoof model was trained on.

    Uses 2.7x rather than a tight crop because anti-spoofing cues —
    screen moiré, paper edges, specular highlights — live outside the
    face itself. A tight crop throws that context away.
    """
    frame_h, frame_w = frame.shape[:2]
    x1, y1, x2, y2 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])

    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    new_w = (x2 - x1) * scale
    new_h = (y2 - y1) * scale

    crop_x1 = int(cx - new_w / 2)
    crop_y1 = int(cy - new_h / 2)
    crop_x2 = int(cx + new_w / 2)
    crop_y2 = int(cy + new_h / 2)

    pad_top = max(0, -crop_y1)
    pad_bottom = max(0, crop_y2 - frame_h)
    pad_left = max(0, -crop_x1)
    pad_right = max(0, crop_x2 - frame_w)

    slice_y1 = max(0, crop_y1)
    slice_y2 = min(frame_h, crop_y2)
    slice_x1 = max(0, crop_x1)
    slice_x2 = min(frame_w, crop_x2)

    cropped = frame[slice_y1:slice_y2, slice_x1:slice_x2].copy()

    if pad_top > 0 or pad_bottom > 0 or pad_left > 0 or pad_right > 0:
        cropped = cv2.copyMakeBorder(
            cropped, pad_top, pad_bottom, pad_left, pad_right,
            cv2.BORDER_CONSTANT, value=[0, 0, 0],
        )

    return cropped

def _preprocess(crop: np.ndarray) -> np.ndarray:
    """
    Resize to 80x80, BGR→RGB, and add batch dim.
    Output shape: (1, 3, 80, 80), dtype float32.
    """
    img = cv2.resize(crop, (80, 80))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype(np.float32)
    img  = img.transpose(2, 0, 1)          # HWC → CHW
    return np.expand_dims(img, axis=0)     # (1, 3, 80, 80)

def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits)
    exp     = np.exp(shifted)
    return exp / exp.sum()

class SpoofService:
    def __init__(self):
        self.session    = get_spoof_session()
        self.input_name = self.session.get_inputs()[0].name
        self.settings   = get_settings()

    def is_live(self, frame: np.ndarray, bbox: np.ndarray) -> tuple[bool, float]:
        """
        Returns (is_live, live_score).

        is_live  — True if the face passes the liveness threshold.
        live_score — softmax probability of class 0 (live/real).
        """
        crop = _expand_crop(frame, bbox)

        if crop.size == 0 or crop.shape[0] == 0 or crop.shape[1] == 0:
            # Empty crop — face is at the very edge of the frame.
            # Fail safe: treat as spoof rather than pass through.
            return False, 0.0

        tensor  = _preprocess(crop)
        outputs = self.session.run(None, {self.input_name: tensor})
        probs   = _softmax(outputs[0][0])

        live_score = float(probs[1])
        return live_score >= self.settings.spoof_threshold, live_score
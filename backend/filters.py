"""Deterministic OpenCV photo rendering; no model downloads or cloud services."""
import cv2
import numpy as np

from .options import AnimeOptions


def resize_frame(frame: np.ndarray, max_side: int) -> np.ndarray:
    h, w = frame.shape[:2]
    scale = min(1, max_side / max(h, w))
    size = (max(2, int(w * scale) // 2 * 2), max(2, int(h * scale) // 2 * 2))
    return cv2.resize(frame, size, interpolation=cv2.INTER_AREA) if size != (w, h) else frame


def stylize(frame: np.ndarray, options: AnimeOptions) -> np.ndarray:
    if frame.dtype != np.uint8 or frame.ndim != 3 or frame.shape[2] != 3:
        raise ValueError("Expected an 8-bit BGR image")
    # The photo module's recursive edge-preserving filter simplifies regions without a broad blur.
    smooth = frame.copy()
    for _ in range(options.smoothing):
        smooth = cv2.edgePreservingFilter(smooth, flags=1, sigma_s=40, sigma_r=0.2)
    if options.celStrength > 0:
        painted = cv2.stylization(smooth, sigma_s=60, sigma_r=0.25)
        smooth = cv2.addWeighted(smooth, 1 - options.celStrength * 0.6,
                                 painted, options.celStrength * 0.6, 0)

    # Quantize lightness in Lab, keeping hue separate from the flat shadow bands.
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float32)
    light = np.clip((lab[:, :, 0] - 128) * options.contrast + 128, 0, 255)
    step = 255 / (options.levels - 1)
    flat = np.round(light / step) * step
    original_l = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    residual = original_l - cv2.GaussianBlur(original_l, (0, 0), 1.2)
    residual = np.sign(residual) * np.maximum(np.abs(residual) - 2, 0)
    lab[:, :, 0] = np.clip(light * (1 - options.celStrength) + flat * options.celStrength
                           + np.clip(residual, -18, 18) * options.detail, 0, 255)
    lab[:, :, 1:] = np.clip(128 + (lab[:, :, 1:] - 128) * options.saturation, 0, 255)
    color = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)

    shadows = np.maximum(0, 1 - light / 150)
    highlights = np.maximum(0, (light - 100) / 155)
    tint = np.stack([shadows * 20 - highlights * 14,
                     highlights * 7 - shadows * 5,
                     highlights * 18 - shadows * 8], axis=-1)
    color += tint * options.paletteStrength * min(1, options.saturation)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    clean = cv2.GaussianBlur(gray, (3, 3), 0.7)
    edges = cv2.Canny(clean, options.edgeThreshold * 2, options.edgeThreshold * 4, L2gradient=True)
    ink = (edges.astype(np.float32) / 255 * options.outlineStrength)[:, :, None]
    color = color * (1 - ink) + np.array([30, 19, 17], dtype=np.float32) * ink
    output = np.clip(color, 0, 255).astype(np.uint8)
    if options.saturation == 0:
        output = cv2.cvtColor(cv2.cvtColor(output, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    return output

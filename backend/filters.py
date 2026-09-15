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


class VideoStylizer:
    """Stylizes a frame sequence with optical-flow temporal smoothing.

    Independent per-frame stylization flickers: quantized shading bands and
    palette tints jump between frames. This warps the previous *stylized*
    frame onto the current one (dense Farneback flow, computed at half
    resolution for speed) and blends the two only where the warped source
    still matches — so motion boundaries and scene cuts fall back to the
    fresh frame instead of ghosting.
    """

    def __init__(self, options: AnimeOptions):
        self.options = options
        self.prev_gray: np.ndarray | None = None
        self.prev_output: np.ndarray | None = None

    def process(self, frame: np.ndarray) -> np.ndarray:
        output = stylize(frame, self.options)
        strength = min(self.options.temporalStrength, 0.85)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if strength > 0 and self.prev_gray is not None and self.prev_gray.shape == gray.shape:
            output = self._blend_with_previous(gray, output, strength)
        self.prev_gray, self.prev_output = gray, output
        return output

    def _blend_with_previous(self, gray: np.ndarray, output: np.ndarray, strength: float) -> np.ndarray:
        h, w = gray.shape
        small = (max(2, w // 2), max(2, h // 2))
        # Backward flow (current -> previous) lets a plain remap pull each
        # current pixel from where it came from in the previous frame.
        flow = cv2.calcOpticalFlowFarneback(
            cv2.resize(gray, small, interpolation=cv2.INTER_AREA),
            cv2.resize(self.prev_gray, small, interpolation=cv2.INTER_AREA),
            None, 0.5, 3, 15, 3, 5, 1.1, 0)
        flow = cv2.resize(flow, (w, h), interpolation=cv2.INTER_LINEAR) * (w / small[0], h / small[1])
        grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        # remap requires CV_32FC1 maps; the flow scaling above promotes to float64.
        map_x = (grid_x + flow[:, :, 0]).astype(np.float32)
        map_y = (grid_y + flow[:, :, 1]).astype(np.float32)
        warped_output = cv2.remap(self.prev_output, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        warped_gray = cv2.remap(self.prev_gray, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        # Trust the history only where the warped luminance still matches.
        mismatch = cv2.absdiff(warped_gray, gray).astype(np.float32)
        weight = np.clip(1 - mismatch / 20, 0, 1)[:, :, None] * strength
        return (output.astype(np.float32) * (1 - weight) + warped_output.astype(np.float32) * weight).astype(np.uint8)

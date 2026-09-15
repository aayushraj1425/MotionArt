import math
from pathlib import Path
from threading import Event
from typing import Callable

import cv2
import imageio_ffmpeg
import numpy as np

from .filters import resize_frame, stylize
from .options import AnimeOptions


def save_png(path: Path, image: np.ndarray) -> None:
    ok, data = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("Could not encode a frame")
    path.write_bytes(data.tobytes())


def process_video(source: Path, output: Path, options: AnimeOptions,
                  progress: Callable[[str, int, int], None] = lambda *_: None,
                  cancelled: Event | None = None) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Output folder must be empty")
    cap = cv2.VideoCapture(str(source))
    writer = None
    completed = False
    try:
        if not cap.isOpened():
            raise ValueError("Could not open this video. Try an MP4 or MOV file.")
        fps = cap.get(cv2.CAP_PROP_FPS)
        source_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if not math.isfinite(fps) or not 0 < fps <= 240 or not math.isfinite(source_count) or source_count < 1:
            raise ValueError("The video has invalid timing information")
        duration = min(source_count / fps, options.clipSeconds)
        count = max(1, round(duration * options.fps))
        source_index = -1
        frame = None
        width = height = 0
        for index in range(count):
            if cancelled and cancelled.is_set():
                raise InterruptedError("Processing cancelled")
            target = min(int(index * fps / options.fps), int(source_count) - 1)
            while source_index < target:
                ok, frame = cap.read()
                if not ok:
                    raise ValueError("Video decoding stopped early. Try a shorter clip.")
                source_index += 1
            if frame is None or frame.shape[0] * frame.shape[1] > 20_000_000:
                raise ValueError("Unsupported frame size")
            result = stylize(resize_frame(frame, options.maxWidth), options)
            if writer is None:
                height, width = result.shape[:2]
                writer = imageio_ffmpeg.write_frames(str(output / "video.mp4"), (width, height),
                    fps=options.fps, codec="libx264", pix_fmt_in="bgr24", pix_fmt_out="yuv420p",
                    macro_block_size=2, ffmpeg_log_level="error",
                    output_params=["-crf", str(options.quantizer), "-preset", "medium", "-movflags", "+faststart"])
                writer.send(None)
            writer.send(np.ascontiguousarray(result).tobytes())
            save_png(output / f"frame-{index:04d}.png", result)
            progress("stylizing", index + 1, count)
        progress("encoding", 0, 1)
        writer.close()
        writer = None
        # Validate the finished container, not just the presence of a file.
        check = cv2.VideoCapture(str(output / "video.mp4"))
        try:
            if not check.isOpened() or int(check.get(cv2.CAP_PROP_FRAME_COUNT)) != count:
                raise ValueError("The encoded video is incomplete")
        finally:
            check.release()
        completed = True
        return {"frameCount": count, "width": width, "height": height,
                "duration": count / options.fps, "fps": options.fps}
    finally:
        cap.release()
        try:
            if writer is not None:
                writer.close()
        finally:
            if not completed:
                # Remove only artifacts produced by this pipeline, never the source video.
                (output / "video.mp4").unlink(missing_ok=True)
                for path in output.glob("frame-*.png"):
                    path.unlink()

import tempfile
from pathlib import Path
from threading import Event
import time
import unittest

import cv2
from fastapi.testclient import TestClient
import numpy as np
from pydantic import ValidationError

from .filters import VideoStylizer, resize_frame, stylize
from .options import AnimeOptions
from .pipeline import process_video
from .server import create_app


def scene() -> np.ndarray:
    image = np.zeros((96, 64, 3), np.uint8)
    for x in range(64):
        image[:, x] = (65 + x, 115 + x, 155 + x)
    cv2.ellipse(image, (32, 45), (16, 24), 0, 0, 360, (110, 170, 215), -1)
    cv2.circle(image, (26, 41), 2, (20, 25, 30), -1)
    cv2.circle(image, (38, 41), 2, (20, 25, 30), -1)
    cv2.line(image, (27, 56), (37, 56), (80, 90, 125), 1)
    return image


def fixture_video(path: Path):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 12, (64, 96))
    if not writer.isOpened():
        raise RuntimeError("Test video encoder unavailable")
    try:
        for i in range(12):
            writer.write(np.roll(scene(), i // 3, axis=1))
    finally:
        writer.release()


class ProcessingTests(unittest.TestCase):
    def test_filter_is_visible_and_preserves_dimensions(self):
        original = scene()
        result = stylize(original, AnimeOptions())
        self.assertEqual(result.shape, original.shape)
        self.assertEqual(result.dtype, np.uint8)
        self.assertGreater(np.abs(result.astype(float) - original).mean(), 5)
        # Small dark eyes must still separate from the surrounding face.
        self.assertLess(result[41, 26].mean(), result[46, 26].mean() - 20)

    def test_grayscale_and_portrait_scaling(self):
        result = stylize(scene(), AnimeOptions(saturation=0))
        np.testing.assert_array_equal(result[:, :, 0], result[:, :, 1])
        np.testing.assert_array_equal(result[:, :, 1], result[:, :, 2])
        self.assertEqual(resize_frame(np.zeros((1920, 1080, 3), np.uint8), 720).shape, (720, 404, 3))

    def test_temporal_smoothing_reduces_flicker(self):
        rng = np.random.default_rng(7)
        frames = []
        for shift in (0, 1):
            noisy = np.roll(scene(), shift, axis=1).astype(np.int16)
            noisy += rng.integers(-12, 13, noisy.shape, dtype=np.int16)
            frames.append(np.clip(noisy, 0, 255).astype(np.uint8))
        options = AnimeOptions(temporalStrength=0.8)
        smoothed = VideoStylizer(options)
        flicker = {
            "independent": [stylize(frame, options) for frame in frames],
            "smoothed": [smoothed.process(frame) for frame in frames],
        }
        diff = {name: np.abs(np.diff([f.astype(float) for f in outputs], axis=0)).mean()
                for name, outputs in flicker.items()}
        self.assertLess(diff["smoothed"], diff["independent"] * 0.8)
        # First frame has no history, so it must equal plain stylization.
        np.testing.assert_array_equal(flicker["smoothed"][0], flicker["independent"][0])

    def test_options_reject_excessive_work_and_unknown_fields(self):
        for data in ({"fps": 100}, {"maxWidth": 8000}, {"clipSeconds": 1000}, {"saturation": float('nan')}, {"unexpected": 1}):
            with self.assertRaises(ValidationError):
                AnimeOptions(**data)

    def test_mp4_frames_timing_and_cancellation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.avi"
            fixture_video(source)
            result = process_video(source, root / "output", AnimeOptions(fps=6, clipSeconds=0.5))
            self.assertEqual(result["frameCount"], 3)
            self.assertEqual(result["duration"], 0.5)
            self.assertEqual(len(list((root / "output").glob("*.png"))), 3)
            cap = cv2.VideoCapture(str(root / "output" / "video.mp4"))
            try:
                self.assertTrue(cap.read()[0])
                self.assertAlmostEqual(cap.get(cv2.CAP_PROP_FPS), 6)
            finally:
                cap.release()
            cancelled = Event()
            cancelled.set()
            with self.assertRaises(InterruptedError):
                process_video(source, root / "cancelled", AnimeOptions(), cancelled=cancelled)
            self.assertEqual(list((root / "cancelled").iterdir()), [])
            self.assertTrue(source.exists())

    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "keep.txt").write_text("keep")
            with self.assertRaises(ValueError):
                process_video(root / "missing.mp4", root, AnimeOptions())
            self.assertEqual((root / "keep.txt").read_text(), "keep")

    def test_local_server_upload_download_and_delete(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.avi"
            fixture_video(source)
            app = create_app(root / "jobs", token="test-pairing")
            headers = {"Authorization": "Bearer test-pairing"}
            with TestClient(app) as client:
                self.assertEqual(client.get("/health").status_code, 401)
                self.assertEqual(client.get("/health", headers=headers).status_code, 200)
                response = client.post("/jobs", headers=headers,
                    files={"video": ("source.avi", source.read_bytes(), "video/avi")},
                    data={"options": AnimeOptions(fps=6, clipSeconds=0.5).model_dump_json()})
                self.assertEqual(response.status_code, 202, response.text)
                job_id = response.json()["id"]
                deadline = time.time() + 30
                while time.time() < deadline:
                    status = client.get(f"/jobs/{job_id}", headers=headers).json()
                    if status["state"] in ("done", "error"):
                        break
                    time.sleep(0.05)
                self.assertEqual(status["state"], "done", status)
                video = client.get(f"/jobs/{job_id}/video", headers=headers)
                self.assertEqual(video.status_code, 200)
                self.assertIn(b"ftyp", video.content[:32])
                image = client.get(f"/jobs/{job_id}/frames/0", headers=headers)
                self.assertTrue(image.content.startswith(b"\x89PNG"))
                self.assertEqual(client.get(f"/jobs/{job_id}/frames/999", headers=headers).status_code, 404)
                self.assertEqual(client.delete(f"/jobs/{job_id}", headers=headers).status_code, 204)
                self.assertEqual(client.get(f"/jobs/{job_id}", headers=headers).status_code, 404)
                self.assertEqual(list((root / "jobs").iterdir()), [])


if __name__ == "__main__":
    unittest.main()

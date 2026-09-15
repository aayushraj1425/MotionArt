"""Single-user local processor. Videos are stored temporarily, never sent elsewhere."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
import secrets
import shutil
from threading import Event, Lock
import time

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError

from .options import AnimeOptions
from .pipeline import process_video

MAX_UPLOAD = 250 * 1024 * 1024


@dataclass
class Job:
    folder: Path
    state: str = "queued"
    stage: str = "loading"
    value: int = 0
    total: int = 1
    result: dict | None = None
    error: str | None = None
    touched: float = field(default_factory=time.time)
    cancelled: Event = field(default_factory=Event)


def create_app(storage: Path | None = None, token: str | None = None) -> FastAPI:
    root = (storage or Path(__file__).parent / ".jobs").resolve()
    root.mkdir(parents=True, exist_ok=True)
    jobs: dict[str, Job] = {}
    guard = Lock()
    pool = ThreadPoolExecutor(max_workers=1)
    pairing_code = token or secrets.token_urlsafe(12)

    @asynccontextmanager
    async def lifespan(_):
        yield
        for job in list(jobs.values()):
            job.cancelled.set()
        pool.shutdown(wait=True, cancel_futures=True)
        for job in list(jobs.values()):
            shutil.rmtree(job.folder, ignore_errors=True)

    app = FastAPI(title="Motion Art local processor", lifespan=lifespan)
    app.state.pairing_code = pairing_code

    def authorize(authorization: str = Header(default="")):
        if not secrets.compare_digest(authorization, f"Bearer {pairing_code}"):
            raise HTTPException(401, "Pairing code is incorrect. Check the Python terminal.")

    def find_job(job_id: str) -> Job:
        with guard:
            job = jobs.get(job_id)
            if not job:
                raise HTTPException(404, "This job has expired or was removed")
            job.touched = time.time()
            return job

    def work(job: Job, options: AnimeOptions):
        job.state = "processing"
        def progress(stage, value, total):
            job.stage, job.value, job.total = stage, value, total
        try:
            job.result = process_video(job.folder / "input.video", job.folder / "output", options, progress, job.cancelled)
            job.state = "done"
        except Exception as error:
            job.error = str(error) or "Processing failed"
            job.state = "error"
        finally:
            (job.folder / "input.video").unlink(missing_ok=True)
            job.touched = time.time()
            if job.cancelled.is_set():
                shutil.rmtree(job.folder, ignore_errors=True)
                with guard:
                    for key, current in list(jobs.items()):
                        if current is job:
                            jobs.pop(key, None)

    @app.get("/health", dependencies=[Depends(authorize)])
    def health():
        return {"status": "ok", "engine": "python-opencv"}

    @app.post("/jobs", status_code=202, dependencies=[Depends(authorize)])
    def submit(video: UploadFile = File(), options: str = Form()):
        try:
            config = AnimeOptions.model_validate_json(options)
        except ValidationError:
            raise HTTPException(422, "Invalid filter settings")
        with guard:
            # Expire idle results whenever a new job arrives.
            for key, old in list(jobs.items()):
                if old.state in ("done", "error") and time.time() - old.touched > 3600:
                    shutil.rmtree(old.folder, ignore_errors=True)
                    del jobs[key]
            if len(jobs) >= 20 or sum(j.state in ("queued", "processing") for j in jobs.values()) >= 3:
                raise HTTPException(429, "Processor is busy. Finish or remove an existing job first.")
            job_id = secrets.token_hex(16)
            job = Job(root / job_id)
            job.folder.mkdir()
            jobs[job_id] = job
        try:
            size = 0
            with (job.folder / "input.video").open("wb") as destination:
                while chunk := video.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise HTTPException(413, "Choose a video smaller than 250 MB")
                    destination.write(chunk)
            if size == 0:
                raise HTTPException(400, "The video is empty")
            pool.submit(work, job, config)
            return {"id": job_id}
        except Exception:
            with guard:
                jobs.pop(job_id, None)
            shutil.rmtree(job.folder, ignore_errors=True)
            raise
        finally:
            video.file.close()

    @app.get("/jobs/{job_id}", dependencies=[Depends(authorize)])
    def status(job_id: str):
        job = find_job(job_id)
        return {"state": job.state, "stage": job.stage, "value": job.value,
                "total": job.total, "result": job.result, "error": job.error}

    @app.get("/jobs/{job_id}/video", dependencies=[Depends(authorize)])
    def video_file(job_id: str):
        job = find_job(job_id)
        if job.state != "done":
            raise HTTPException(409, "Video is not ready")
        return FileResponse(job.folder / "output" / "video.mp4", media_type="video/mp4", filename="motion-art.mp4")

    @app.get("/jobs/{job_id}/frames/{index}", dependencies=[Depends(authorize)])
    def frame_file(job_id: str, index: int):
        job = find_job(job_id)
        if job.state != "done" or not job.result or not 0 <= index < job.result["frameCount"]:
            raise HTTPException(404, "Frame not found")
        return FileResponse(job.folder / "output" / f"frame-{index:04d}.png", media_type="image/png")

    @app.delete("/jobs/{job_id}", status_code=204, dependencies=[Depends(authorize)])
    def remove(job_id: str):
        job = find_job(job_id)
        job.cancelled.set()
        if job.state in ("done", "error"):
            with guard:
                jobs.pop(job_id, None)
            shutil.rmtree(job.folder, ignore_errors=True)

    return app

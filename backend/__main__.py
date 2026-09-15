import argparse
from pathlib import Path
import socket

import cv2
import numpy as np

from .filters import resize_frame, stylize
from .options import AnimeOptions
from .pipeline import process_video, save_png


def main():
    parser = argparse.ArgumentParser(description="Motion Art Python OpenCV processor")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    for name in ("video", "image"):
        command = sub.add_parser(name)
        command.add_argument("input", type=Path)
        command.add_argument("output", type=Path)
        command.add_argument("--options", type=Path, help="JSON settings using the app's option names")
    args = parser.parse_args()
    if args.command == "serve":
        import uvicorn
        from .server import create_app
        app = create_app()
        print(f"Pairing code: {app.state.pairing_code}", flush=True)
        if args.host == "0.0.0.0":
            addresses = sorted({info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
            print("Computer addresses (use the Wi-Fi address in Motion Art):", flush=True)
            for address in addresses:
                print(f"  http://{address}:{args.port}", flush=True)
        uvicorn.run(app, host=args.host, port=args.port)
        return
    options = AnimeOptions.model_validate_json(args.options.read_text()) if args.options else AnimeOptions()
    if args.output.exists():
        parser.error("Choose a new output path; existing files and folders are not overwritten")
    if args.command == "video":
        result = process_video(args.input, args.output, options, lambda stage, value, total: print(f"{stage}: {value}/{total}"))
        print(result)
    else:
        source = cv2.imdecode(np.frombuffer(args.input.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
        if source is None:
            parser.error("Could not decode the input image")
        if args.output.suffix.lower() != ".png":
            parser.error("Image output must end in .png")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        save_png(args.output, stylize(resize_frame(source, options.maxWidth), options))


if __name__ == "__main__":
    main()

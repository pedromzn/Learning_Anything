"""
The lesson voice engine: Kokoro (Apache 2.0) running 100% locally, on the CPU, through onnxruntime.

Node opens this process once and talks to it in JSON lines:
  input (stdin):   {"id": 1, "text": "...", "voice": "af_heart", "lang": "en-us", "speed": 1.0, "output": "/path/segment.wav"}
  reply (stdout):  {"id": 1, "ok": true}   or   {"id": 1, "ok": false, "error": "..."}
The model loads only once; when stdin closes, the process ends.

Usage: python kokoro_worker.py <model.onnx> <voices.bin>
"""

import json
import sys


def reply(data):
    sys.stdout.write(json.dumps(data, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: kokoro_worker.py <model.onnx> <voices.bin>\n")
        return 2

    import soundfile
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(sys.argv[1], sys.argv[2])
    reply({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            samples, rate = kokoro.create(
                request["text"],
                voice=request["voice"],
                speed=float(request.get("speed", 1.0)),
                lang=request.get("lang") or "en-us",
            )
            soundfile.write(request["output"], samples, rate)
            reply({"id": request_id, "ok": True})
        except Exception as error:  # one bad segment does not bring the engine down
            reply({"id": request_id, "ok": False, "error": f"{type(error).__name__}: {error}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())

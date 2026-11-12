"""
The Feynman lesson listener: Whisper (faster-whisper, MIT) running 100% locally, on the CPU.

Node opens this process once and talks to it in JSON lines:
  input (stdin):   {"id": 1, "wav": "/path/speech.wav", "hint": "...", "language": "en"}
                   (16 kHz mono wav; hint = the expected vocabulary)
  reply (stdout):  {"id": 1, "ok": true, "text": "..."}   or   {"id": 1, "ok": false, "error": "..."}
The model loads once and only from disk (local_files_only): `npm run feynman:install` downloads it.

Usage: python whisper_worker.py <size> <models_folder>
"""

import json
import os
import sys


def reply(data):
    sys.stdout.write(json.dumps(data, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: whisper_worker.py <size> <models_folder>\n")
        return 2

    import soundfile
    from faster_whisper import WhisperModel

    threads = max(1, min(8, (os.cpu_count() or 2) // 2))
    model = WhisperModel(
        sys.argv[1],
        device="cpu",
        compute_type="int8",
        cpu_threads=threads,
        download_root=sys.argv[2],
        local_files_only=True,
    )
    reply({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            # the audio arrives already decoded by ffmpeg: no dependency on the `av` library
            samples, _ = soundfile.read(request["wav"], dtype="float32")
            segments, _ = model.transcribe(
                samples,
                language=request.get("language") or "en",
                beam_size=1,
                vad_filter=True,
                condition_on_previous_text=False,
                # the module vocabulary (topic and terms): helps Whisper get technical words right
                initial_prompt=(request.get("hint") or None),
            )
            text = " ".join(s.text.strip() for s in segments).strip()
            reply({"id": request_id, "ok": True, "text": text})
        except Exception as error:  # one bad utterance does not bring the listener down
            reply({"id": request_id, "ok": False, "error": f"{type(error).__name__}: {error}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())

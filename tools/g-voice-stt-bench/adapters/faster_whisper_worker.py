import argparse
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--compute-type", required=True)
    parser.add_argument("--language", required=True)
    parser.add_argument("--beam-size", required=True, type=int)
    return parser.parse_args()


def emit(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def request_language(request, configured_language):
    if configured_language is not None:
        return configured_language
    language = request.get("language")
    if language in ("th", "en", None):
        return language
    raise ValueError("request language must be th, en, or null")


def main():
    arguments = parse_arguments()
    model_path = Path(arguments.model_path).expanduser().resolve()
    if not model_path.is_dir():
        raise ValueError("model_path must be an existing local directory")
    configured_language = None if arguments.language == "auto" else arguments.language
    if configured_language not in ("th", "en", None):
        raise ValueError("language must be th, en, or auto")
    if arguments.beam_size < 1:
        raise ValueError("beam_size must be a positive integer")

    model = WhisperModel(
        str(model_path),
        device=arguments.device,
        compute_type=arguments.compute_type,
        local_files_only=True,
    )
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            request_id = request["id"]
            wav_path = request["wav"]
            if not isinstance(request_id, str) or not isinstance(wav_path, str):
                raise ValueError("request id and wav must be strings")
            language = request_language(request, configured_language)
            segments, _ = model.transcribe(
                wav_path,
                language=language,
                beam_size=arguments.beam_size,
            )
            emit({"id": request_id, "transcript": "".join(segment.text for segment in segments).strip()})
        except Exception as error:
            request_id = request.get("id") if isinstance(request, dict) else None
            emit({"id": request_id, "error": str(error)})


if __name__ == "__main__":
    main()

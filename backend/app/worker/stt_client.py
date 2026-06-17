def transcribe_audio(audio_path: str | None) -> dict:
    message = "STT는 개발 중입니다. 실제 음성 전사는 mock 처리되었습니다."

    return {
        "status": "developing",
        "is_mock": True,
        "source_path": audio_path,
        "content": message,
        "segments": [
            {
                "start_ms": 0,
                "end_ms": 3000,
                "speaker": "speaker_1",
                "text": message,
            }
        ],
    }

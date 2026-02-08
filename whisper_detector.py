#!/usr/bin/env python3
"""
Speech segmentation using Whisper
Outputs JSON with speech segments timestamps based on sentences
"""
import sys
import json
import whisper
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

def detect_speech_segments(audio_path, model_size='small', initial_prompt='', device='cuda'):
    """
    Detect speech segments using Whisper

    Args:
        audio_path: Path to audio file
        model_size: Whisper model size (tiny, base, small, medium, large)
        initial_prompt: Optional prompt to guide transcription style
        device: Device to use ('cuda' for GPU, 'cpu' for CPU)

    Returns:
        List of segments with start/end timestamps and text
    """
    # Load Whisper model
    print(f"Loading Whisper model '{model_size}' on {device.upper()}...", file=sys.stderr)
    model = whisper.load_model(model_size, device=device)

    # Transcribe with word timestamps
    print(f"Transcribing audio...", file=sys.stderr)
    result = model.transcribe(
        audio_path,
        language="en",  # Англійська мова
        word_timestamps=True,
        verbose=False,

        # ============ НАЛАШТУВАННЯ МАКСИМАЛЬНОЇ ЯКОСТІ ============
        temperature=0.0,  # Детерміновано (найточніше)
        beam_size=10,     # Збільшено для кращої точності
        best_of=5,        # Розглядати 5 кандидатів
        patience=2.0,     # Більше терпіння = краща якість

        # ============ ФІЛЬТРАЦІЯ ============
        compression_ratio_threshold=2.4,
        logprob_threshold=-1.0,
        no_speech_threshold=0.6,

        # ============ КОНТЕКСТ ============
        condition_on_previous_text=True,
        initial_prompt=initial_prompt if initial_prompt else None
    )

    # Extract segments with padding
    PADDING_END = 0.5  # Додаємо 0.5 сек в кінці щоб не обрізати останнє слово

    segments = []
    total_segments = len(result['segments'])

    for i, segment in enumerate(result['segments']):
        start = segment['start']

        # Для останнього сегмента не додаємо padding (може вийти за межі файлу)
        is_last = (i == total_segments - 1)
        end = segment['end'] if is_last else segment['end'] + PADDING_END

        segments.append({
            'start': round(start, 3),
            'end': round(end, 3),
            'duration': round(end - start, 3),
            'text': segment['text'].strip()
        })

    return segments

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No audio file specified'}))
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else 'small'
    initial_prompt = sys.argv[3] if len(sys.argv) > 3 else ''
    device = sys.argv[4] if len(sys.argv) > 4 else 'cuda'

    try:
        segments = detect_speech_segments(audio_path, model_size, initial_prompt, device)
        result = {
            'success': True,
            'segments': segments,
            'count': len(segments),
            'prompt_used': initial_prompt
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Speech segmentation using Whisper + spaCy
Outputs JSON with speech segments timestamps based on sentences and logical breaks
"""
import sys
import json
import whisper
import spacy
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

# Load spaCy model for NLP segmentation
try:
    nlp = spacy.load("en_core_web_lg")
except OSError:
    print("Downloading spaCy model...", file=sys.stderr)
    import os
    os.system("python -m spacy download en_core_web_lg")
    nlp = spacy.load("en_core_web_lg")

def split_long_sentence_with_spacy(text, words, max_duration=7.0):
    """
    Split long sentence into logical chunks using spaCy

    Args:
        text: Full sentence text
        words: List of word dicts with 'word', 'start', 'end' keys
        max_duration: Maximum duration in seconds for a chunk

    Returns:
        List of chunks with start, end, duration, text
    """
    if not words:
        return []

    duration = words[-1]['end'] - words[0]['start']

    # If short enough, return as is
    if duration <= max_duration:
        return [{
            'start': words[0]['start'],
            'end': words[-1]['end'],
            'duration': duration,
            'text': text,
            'words': words
        }]

    # Use spaCy to parse
    doc = nlp(text)

    # Find split points: conjunctions (and, but, or, so) and subordinate conjunctions
    split_indices = []
    word_idx = 0

    for i, token in enumerate(doc):
        # Split at coordinating conjunctions and commas in long sentences
        if token.dep_ in ['cc', 'punct'] and token.text.lower() in [',', 'and', 'but', 'or', 'so']:
            # Find corresponding word index
            for j in range(word_idx, len(words)):
                if words[j]['word'].strip().lower() == token.text.lower():
                    split_indices.append(j)
                    word_idx = j + 1
                    break

    # If no split points found, split by word count
    if not split_indices:
        mid = len(words) // 2
        split_indices = [mid]

    # Create chunks
    chunks = []
    start_idx = 0

    for split_idx in split_indices + [len(words)]:
        if split_idx > start_idx:
            chunk_words = words[start_idx:split_idx]
            if chunk_words:
                chunk_text = ' '.join([w['word'] for w in chunk_words])
                chunks.append({
                    'start': chunk_words[0]['start'],
                    'end': chunk_words[-1]['end'],
                    'duration': chunk_words[-1]['end'] - chunk_words[0]['start'],
                    'text': chunk_text.strip(),
                    'words': chunk_words
                })
            start_idx = split_idx

    return chunks if chunks else [{
        'start': words[0]['start'],
        'end': words[-1]['end'],
        'duration': words[-1]['end'] - words[0]['start'],
        'text': text,
        'words': words
    }]


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

    # Extract segments BY PUNCTUATION (sentence-based)
    PADDING_END = 0.2  # Невеликий padding 0.1 сек

    # Отримуємо всі слова з таймінгами
    all_words = []
    for segment in result['segments']:
        if 'words' in segment:
            all_words.extend(segment['words'])

    if not all_words:
        # Fallback: якщо немає word timestamps, використати стандартні сегменти
        segments = []
        for i, segment in enumerate(result['segments']):
            start = segment['start']
            is_last = (i == len(result['segments']) - 1)
            end = segment['end'] if is_last else segment['end'] + PADDING_END
            segments.append({
                'start': round(start, 3),
                'end': round(end, 3),
                'duration': round(end - start, 3),
                'text': segment['text'].strip()
            })
        return segments

    # Групуємо слова по реченнях (по пунктуації)
    sentence_segments = []
    current_words = []
    sentence_endings = {'.', '!', '?'}

    for word_info in all_words:
        word = word_info['word']
        current_words.append(word_info)

        # Перевіряємо чи закінчується речення
        if any(word.rstrip().endswith(punct) for punct in sentence_endings):
            # Створюємо сегмент з накопичених слів
            text = ' '.join([w['word'] for w in current_words])
            sentence_segments.append({
                'words': current_words[:],
                'text': text.strip()
            })
            current_words = []

    # Якщо залишились слова без пунктуації в кінці - додати як окремий сегмент
    if current_words:
        text = ' '.join([w['word'] for w in current_words])
        sentence_segments.append({
            'words': current_words[:],
            'text': text.strip()
        })

    # Тепер розбиваємо довгі сегменти за допомогою spaCy
    MAX_SEGMENT_DURATION = 7.0  # Максимум 7 секунд для зручного диктанту
    segments = []

    for sent_seg in sentence_segments:
        words = sent_seg['words']
        text = sent_seg['text']

        if not words:
            continue

        # Перевіряємо тривалість
        duration = words[-1]['end'] - words[0]['start']

        if duration > MAX_SEGMENT_DURATION:
            # Розбити за допомогою spaCy
            print(f"  Splitting long segment ({duration:.1f}s): {text[:50]}...", file=sys.stderr)
            chunks = split_long_sentence_with_spacy(text, words, MAX_SEGMENT_DURATION)

            for chunk in chunks:
                segments.append({
                    'start': round(chunk['start'], 3),
                    'end': round(chunk['end'] + PADDING_END, 3),
                    'duration': round(chunk['end'] - chunk['start'] + PADDING_END, 3),
                    'text': chunk['text']
                })
        else:
            # Сегмент нормальної довжини - додати як є
            segments.append({
                'start': round(words[0]['start'], 3),
                'end': round(words[-1]['end'] + PADDING_END, 3),
                'duration': round(words[-1]['end'] - words[0]['start'] + PADDING_END, 3),
                'text': text
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

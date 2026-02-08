# Audio Dictation - English Learning Helper

Splits audio into phrase segments and repeats them for dictation practice.

## Features

- 🎯 Uses **Whisper AI** for accurate sentence-level phrase detection
- 📝 Recognizes text and creates timestamped transcriptions
- 🔄 Repeats each phrase N times with pauses
- 🎵 Preserves original audio quality
- 🌍 Works completely offline (no internet required)

## Installation

### 1. Node.js dependencies
```bash
npm install
```

### 2. Python dependencies

Create a virtual environment and install dependencies:

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

or separately:
```bash
python3 -m venv venv
./venv/bin/pip install openai-whisper
```

### 3. ffmpeg
Make sure ffmpeg is installed:
```bash
ffmpeg -version
```

## Project Structure

```
audio-source/              # Place your input audio files here
result/
  ├── audio/              # Generated dictation audio files (with repetitions)
  ├── shadowing/          # Generated shadowing audio files (segment + pause)
  └── text/               # Generated transcripts with timestamps
```

## Usage

1. Place your audio file (.mp3) in `audio-source/` folder
   - The **latest modified file** will be automatically selected
2. Configure `config.json` (optional):
   ```json
   {
     "whisperPrompt": "Description of the video content",
     "repeatCount": 2,
     "pauseBetweenRepeats": 3
   }
   ```
3. Run:
   ```bash
   make run
   ```

To clean all generated files:
```bash
make clear
```

Output files are automatically named with date + number:
- `result/audio/output_dictation_20250208_0001.mp3` - **Dictation**: phrases repeated multiple times with pauses
- `result/shadowing/output_dictation_20250208_0001.mp3` - **Shadowing**: each phrase followed by silence (same duration) for practice
- `result/text/transcript_20250208_0001.txt` - text with timestamps for each sentence

Next run today will create `20250208_0002`, tomorrow will start with `20250209_0001`.

## Configuration

Edit `config.json`:

```json
{
  "whisperPrompt": "Steven looks at a picture of a big red bus and talks about it.",
  "repeatCount": 2,
  "pauseBetweenRepeats": 3,
  "pauseAfterSegment": 10,
  "minSegmentLength": 0.4,
  "device": "cuda"
}
```

**Parameters:**
- `whisperPrompt` - Video description (helps Whisper recognize better, leave empty if unknown)
- `repeatCount` - How many times to repeat each phrase (default: 2)
- `pauseBetweenRepeats` - Short pause between repetitions in seconds (default: 3)
- `pauseAfterSegment` - Long pause after all repetitions, before next phrase (default: 10)
- `minSegmentLength` - Minimum segment length to filter noise (default: 0.4)
- `device` - Processing device: `"cuda"` for GPU (fast), `"cpu"` for CPU (slow) (default: "cuda")

**Note:**
- Audio file is auto-selected (latest .mp3 from `audio-source/`)
- Change `whisperPrompt` for better recognition of specific words!

## How it works

1. **Whisper AI**: Recognizes speech and finds timestamps for each sentence
2. **Transcript**: Saves text with timestamps to `transcript.txt`
3. **Splitting**: Splits audio into segments based on Whisper timestamps
4. **Assembly**: Builds final file with repetitions and pauses

## Example

```bash
# Process audio.mp3 file
node index.js audio.mp3

# Use a different file
node index.js lesson_01.mp3
```

---

[Українська версія](README.uk.md)

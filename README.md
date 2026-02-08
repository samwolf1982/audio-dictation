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
  ├── audio/              # Generated dictation audio files
  └── text/               # Generated transcripts with timestamps
```

## Usage

1. Place your audio file in `audio-source/` folder
2. Configure `config.json`:
   ```json
   {
     "audioFile": "lesson.mp3",
     "whisperPrompt": "Description of the video content"
   }
   ```
3. Run:
   ```bash
   make run
   ```

Output files are automatically numbered:
- `result/audio/output_dictation_0001.mp3` - audio for dictation with repetitions
- `result/text/transcript_0001.txt` - text with timestamps for each sentence

Next run will create `0002`, then `0003`, etc.

## Configuration

Edit `config.json` for each video:

```json
{
  "audioFile": "audio.mp3",
  "whisperPrompt": "Steven looks at a picture of a big red bus and talks about it.",
  "repeatCount": 2,
  "pauseBetweenRepeats": 3,
  "minSegmentLength": 0.4
}
```

**Parameters:**
- `audioFile` - Input audio file name (from `audio-source/` folder, filename only)
- `whisperPrompt` - Video description (helps Whisper recognize better, leave empty if unknown)
- `repeatCount` - How many times to repeat each phrase (default: 2)
- `pauseBetweenRepeats` - Pause between repetitions in seconds (default: 3)
- `minSegmentLength` - Minimum segment length to filter noise (default: 0.4)

**Important:** Change `whisperPrompt` for each video - it improves recognition quality for specific words!

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

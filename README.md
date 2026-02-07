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

## Usage

```bash
node index.js your_audio.mp3
```

Output:
- `output_dictation.mp3` - audio for dictation with repetitions
- `transcript.txt` - text with timestamps for each sentence

## Configuration

Edit parameters in `index.js`:

```javascript
const REPEAT_COUNT = 3;              // How many times to repeat each phrase
const PAUSE_BETWEEN_REPEATS = 3;     // Pause between repetitions (seconds)
const MIN_SEGMENT_LENGTH = 0.4;      // Minimum segment length (noise filter)

// Video description - helps Whisper recognize better
const WHISPER_PROMPT = "Steven looks at a picture of a big red bus and talks about it.";
```

**Important:** Change `WHISPER_PROMPT` for each video - it improves recognition quality for specific words!

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

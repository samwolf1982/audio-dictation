const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

// ================= НАЛАШТУВАННЯ =================
const INPUT_FILE = process.argv[2] || 'audio.mp3';
const OUTPUT_FILE = 'output_dictation.mp3';
const TRANSCRIPT_FILE = 'transcript.txt';

const REPEAT_COUNT = 3;
const PAUSE_BETWEEN_REPEATS = 3;

// Мінімальна довжина сегмента (фільтрує шум)
const MIN_SEGMENT_LENGTH = 0.4;

// Whisper: опис контексту відео (покращує розпізнавання)
// const WHISPER_PROMPT = "Kerri shares her special recipe for making a delicious omelet.";
const WHISPER_PROMPT = "Steven looks at a picture of a big red bus and talks about it.";
// ================================================

const TEMP_DIR = path.join(__dirname, 'temp_segments');
const SILENCE_FILE = path.join(TEMP_DIR, 'silence.mp3');

const run = async () => {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Error: File "${INPUT_FILE}" not found.`);
        process.exit(1);
    }

    try {
        console.time('Processing Time');
        await fs.emptyDir(TEMP_DIR);

        console.log('🕵️  1. Analyzing audio format...');
        const audioFormat = await getAudioFormat(INPUT_FILE);

        console.log('🔇 2. Generating matching silence...');
        await generateSilenceFile(PAUSE_BETWEEN_REPEATS, SILENCE_FILE, audioFormat);

        console.log('🔍 3. Detecting phrases using Whisper AI...');
        const segments = await detectSegments(INPUT_FILE);

        // Фільтруємо зовсім сміття, але залишаємо короткі слова
        const validSegments = segments.filter(s => (s.duration === null || s.duration > MIN_SEGMENT_LENGTH));

        console.log(`✅ Found ${segments.length} raw segments.`);
        console.log(`👉 Kept ${validSegments.length} segments after filtering noise.`);

        if (validSegments.length < 2) {
            console.warn("⚠️ WARNING: Found very few segments. Check audio quality or try a larger Whisper model");
        }

        console.log('📄 4. Saving transcript...');
        saveTranscript(validSegments, TRANSCRIPT_FILE);

        console.log('✂️  5. Splitting audio...');
        const segmentFiles = await splitAudio(INPUT_FILE, validSegments, audioFormat);

        console.log('📝 6. Building playlist...');
        const concatListPath = createConcatList(segmentFiles);

        console.log('💾 7. Merging final file...');
        await mergeAudio(concatListPath, OUTPUT_FILE, audioFormat);

        console.log('🧹 8. Cleanup...');
        await fs.remove(TEMP_DIR);

        console.log(`🎉 Done!`);
        console.log(`   Audio: ${OUTPUT_FILE}`);
        console.log(`   Transcript: ${TRANSCRIPT_FILE}`);
        console.timeEnd('Processing Time');

    } catch (err) {
        console.error('❌ Error:', err);
    }
};

// --- CORE FUNCTIONS ---

function getAudioFormat(file) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(file, (err, metadata) => {
            if (err) return reject(err);
            const stream = metadata.streams.find(s => s.codec_type === 'audio');
            if (!stream) return reject(new Error('No audio stream found'));
            resolve({
                sampleRate: stream.sample_rate || 44100,
                channels: stream.channels || 2,
                bit_rate: stream.bit_rate || '128k' // Get original bitrate
            });
        });
    });
}

function generateSilenceFile(duration, outputPath, format) {
    return new Promise((resolve, reject) => {
        const layout = format.channels === 1 ? 'mono' : 'stereo';
        ffmpeg()
            .input(`anullsrc=r=${format.sampleRate}:cl=${layout}`)
            .inputFormat('lavfi')
            .duration(duration)
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

function detectSegments(file) {
    return new Promise((resolve, reject) => {
        const whisperScript = path.join(__dirname, 'whisper_detector.py');
        const pythonPath = path.join(__dirname, 'venv', 'bin', 'python3');
        const cmd = `"${pythonPath}" "${whisperScript}" "${file}" large "${WHISPER_PROMPT}"`;

        console.log('   (This may take a minute on first run - downloading model...)');
        console.log(`   Context: "${WHISPER_PROMPT}"`);

        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Whisper Error:', stderr);
                return reject(new Error(`Whisper detection failed: ${error.message}`));
            }

            try {
                const result = JSON.parse(stdout);

                if (!result.success) {
                    return reject(new Error(`Whisper error: ${result.error}`));
                }

                // Convert Whisper segments to our format
                const segments = result.segments.map(seg => ({
                    start: seg.start,
                    duration: seg.duration,
                    text: seg.text  // Зберігаємо текст для можливого виводу
                }));

                if (segments.length === 0) {
                    console.warn('⚠️  No speech detected by Whisper!');
                    resolve([{ start: 0, duration: null }]);
                    return;
                }

                console.log(`   📝 Transcription preview: "${segments[0].text}..."`);
                resolve(segments);
            } catch (parseError) {
                reject(new Error(`Failed to parse Whisper output: ${parseError.message}`));
            }
        });
    });
}

async function splitAudio(inputFile, segments, format) {
    const files = [];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const fileName = path.join(TEMP_DIR, `seg_${i.toString().padStart(3, '0')}.mp3`);

        await new Promise((resolve, reject) => {
            let command = ffmpeg(inputFile).setStartTime(seg.start);
            if (seg.duration) command.setDuration(seg.duration);

            command
                .output(fileName)
                .audioCodec('libmp3lame')
                .audioFrequency(parseInt(format.sampleRate))
                .audioChannels(format.channels)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        files.push(fileName);
    }
    return files;
}

function saveTranscript(segments, outputPath) {
    let content = '# Transcript with Timestamps\n\n';

    segments.forEach((seg, i) => {
        const startTime = formatTime(seg.start);
        const endTime = formatTime(seg.start + seg.duration);
        const text = seg.text || '[No text]';

        content += `[${startTime} - ${endTime}] ${text}\n`;
    });

    fs.writeFileSync(outputPath, content, 'utf-8');
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
}

function createConcatList(files) {
    const listPath = path.join(TEMP_DIR, 'list.txt');
    let content = '';
    files.forEach(f => {
        for (let i = 0; i < REPEAT_COUNT; i++) {
            content += `file '${f}'\n`;
            content += `file '${SILENCE_FILE}'\n`;
        }
    });
    fs.writeFileSync(listPath, content);
    return listPath;
}

function mergeAudio(listPath, output, format) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(listPath)
            .inputOptions(['-f concat', '-safe 0'])
            .audioCodec('libmp3lame')
            .audioBitrate(format.bit_rate)
            .save(output)
            .on('end', resolve)
            .on('error', reject);
    });
}

run();

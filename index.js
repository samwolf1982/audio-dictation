const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

// ================= ЗАВАНТАЖЕННЯ КОНФІГУ =================
const CONFIG_FILE = path.join(__dirname, 'config.json');
let config;

try {
    const configData = fs.readFileSync(CONFIG_FILE, 'utf-8');
    config = JSON.parse(configData);
} catch (error) {
    console.error(`❌ Error reading config.json: ${error.message}`);
    console.log('Creating default config.json...');
    config = {
        whisperPrompt: '',
        whisperModel: 'large-v3',
        repeatCount: 2,
        pauseBetweenRepeats: 3,
        pauseAfterSegment: 10,
        minSegmentLength: 0.4,
        device: 'cuda'
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Параметри з конфігу
const REPEAT_COUNT = config.repeatCount;
const PAUSE_BETWEEN_REPEATS = config.pauseBetweenRepeats;
const PAUSE_AFTER_SEGMENT = config.pauseAfterSegment || 10;
const MIN_SEGMENT_LENGTH = config.minSegmentLength;
const WHISPER_PROMPT = config.whisperPrompt;
const WHISPER_MODEL = config.whisperModel || 'large-v3';
const DEVICE = config.device || 'cuda';

// Папки
const AUDIO_SOURCE_DIR = path.join(__dirname, 'audio-source');
const RESULT_AUDIO_DIR = path.join(__dirname, 'result', 'audio');
const RESULT_SHADOWING_DIR = path.join(__dirname, 'result', 'shadowing');
const RESULT_TEXT_DIR = path.join(__dirname, 'result', 'text');
const TEMP_DIR = path.join(__dirname, 'temp_segments');
const SILENCE_FILE_SHORT = path.join(TEMP_DIR, 'silence_short.mp3');
const SILENCE_FILE_LONG = path.join(TEMP_DIR, 'silence_long.mp3');

// Автоматично знаходимо найновіший аудіо/відео файл в audio-source/
const latestAudioFile = findLatestAudioFile(AUDIO_SOURCE_DIR);
if (!latestAudioFile) {
    console.error('❌ Error: No audio/video files found in audio-source/ folder');
    console.log('💡 Place your file (.mp3, .mp4, .m4a, .wav) in the audio-source/ folder');
    process.exit(1);
}

const INPUT_FILENAME = latestAudioFile.name;
const INPUT_FILE = latestAudioFile.path;

// Знаходимо наступний номер для output файлів (з датою)
const outputInfo = getNextOutputNumber();
if (outputInfo.number > 9999) {
    console.error(`❌ Error: Daily output limit reached (9999 files for ${outputInfo.date}).`);
    console.log('💡 Either wait for tomorrow or manually clean up result folder.');
    process.exit(1);
}

const OUTPUT_DATE = outputInfo.date;
const OUTPUT_NUMBER = outputInfo.number.toString().padStart(4, '0');
const OUTPUT_FILENAME = `output_dictation_${OUTPUT_DATE}_${OUTPUT_NUMBER}.mp3`;
const OUTPUT_FILE = path.join(RESULT_AUDIO_DIR, OUTPUT_FILENAME);
const OUTPUT_SHADOWING_FILE = path.join(RESULT_SHADOWING_DIR, OUTPUT_FILENAME);
const TRANSCRIPT_FILE = path.join(RESULT_TEXT_DIR, `transcript_${OUTPUT_DATE}_${OUTPUT_NUMBER}.txt`);

// =======================================================

// Функція для знаходження найновішого аудіо/відео файлу
function findLatestAudioFile(dir) {
    try {
        const files = fs.readdirSync(dir);

        // Підтримувані формати
        const supportedExtensions = ['.mp3', '.mp4', '.m4a', '.wav', '.avi', '.mkv', '.mov'];

        const audioFiles = files.filter(f => {
            const ext = f.toLowerCase().slice(f.lastIndexOf('.'));
            return supportedExtensions.includes(ext);
        });

        if (audioFiles.length === 0) {
            return null;
        }

        // Сортуємо по даті модифікації (найновіший перший)
        const filesWithStats = audioFiles.map(f => {
            const fullPath = path.join(dir, f);
            const stats = fs.statSync(fullPath);
            return {
                name: f,
                path: fullPath,
                mtime: stats.mtime
            };
        });

        filesWithStats.sort((a, b) => b.mtime - a.mtime);

        return filesWithStats[0];
    } catch (error) {
        return null;
    }
}

// Функція для знаходження наступного номера файлу (з урахуванням дати)
function getNextOutputNumber() {
    // Отримуємо сьогоднішню дату в форматі YYYYMMDD
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    try {
        const files = fs.readdirSync(RESULT_AUDIO_DIR);
        // Шукаємо файли тільки з сьогоднішньою датою
        const pattern = new RegExp(`^output_dictation_${today}_(\\d{4})\\.mp3$`);

        let maxNumber = 0;
        files.forEach(file => {
            const match = file.match(pattern);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNumber) maxNumber = num;
            }
        });

        return { date: today, number: maxNumber + 1 };
    } catch (error) {
        // Якщо папка не існує або помилка - починаємо з 1
        return { date: today, number: 1 };
    }
}

const run = async () => {
    try {
        console.time('Processing Time');
        console.log(`🎵 Auto-selected: audio-source/${INPUT_FILENAME}`);
        console.log(`📝 Output: ${OUTPUT_DATE}_${OUTPUT_NUMBER}`);
        console.log(`   - result/audio/${OUTPUT_FILENAME} (dictation)`);
        console.log(`   - result/shadowing/${OUTPUT_FILENAME} (shadowing)`);
        console.log(`   - result/text/transcript_${OUTPUT_DATE}_${OUTPUT_NUMBER}.txt`);
        console.log('');

        // Створюємо папки якщо їх немає
        await fs.ensureDir(RESULT_AUDIO_DIR);
        await fs.ensureDir(RESULT_SHADOWING_DIR);
        await fs.ensureDir(RESULT_TEXT_DIR);
        await fs.emptyDir(TEMP_DIR);

        console.log('🕵️  1. Analyzing audio format...');
        const audioFormat = await getAudioFormat(INPUT_FILE);

        console.log('🔇 2. Generating silence files...');
        await generateSilenceFile(PAUSE_BETWEEN_REPEATS, SILENCE_FILE_SHORT, audioFormat);
        await generateSilenceFile(PAUSE_AFTER_SEGMENT, SILENCE_FILE_LONG, audioFormat);

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

        console.log('💾 7. Merging dictation file...');
        await mergeAudio(concatListPath, OUTPUT_FILE, audioFormat);

        console.log('🎭 8. Creating shadowing file...');
        const shadowingListPath = await createShadowingConcatList(segmentFiles, validSegments, audioFormat);
        await mergeAudio(shadowingListPath, OUTPUT_SHADOWING_FILE, audioFormat);

        console.log('🧹 9. Cleanup...');
        await fs.remove(TEMP_DIR);

        console.log('');
        console.log(`🎉 Done! Output ${OUTPUT_DATE}_${OUTPUT_NUMBER} created:`);
        console.log(`   📀 Dictation: result/audio/${OUTPUT_FILENAME}`);
        console.log(`   🎭 Shadowing: result/shadowing/${OUTPUT_FILENAME}`);
        console.log(`   📄 Text:      result/text/transcript_${OUTPUT_DATE}_${OUTPUT_NUMBER}.txt`);
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
        const cmd = `"${pythonPath}" "${whisperScript}" "${file}" ${WHISPER_MODEL} "${WHISPER_PROMPT}" "${DEVICE}"`;

        console.log('   (This may take a minute on first run - downloading model...)');
        console.log(`   Model: ${WHISPER_MODEL}`);
        console.log(`   Device: ${DEVICE.toUpperCase()}`);
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
    files.forEach((f, segmentIndex) => {
        for (let i = 0; i < REPEAT_COUNT; i++) {
            content += `file '${f}'\n`;

            // Після кожного повтору - коротка пауза
            if (i < REPEAT_COUNT - 1) {
                content += `file '${SILENCE_FILE_SHORT}'\n`;
            }
        }

        // Після всіх повторів сегмента - довга пауза (крім останнього сегмента)
        if (segmentIndex < files.length - 1) {
            content += `file '${SILENCE_FILE_LONG}'\n`;
        }
    });
    fs.writeFileSync(listPath, content);
    return listPath;
}

async function createShadowingConcatList(files, segments, audioFormat) {
    const listPath = path.join(TEMP_DIR, 'shadowing_list.txt');
    let content = '';

    for (let i = 0; i < files.length; i++) {
        const segmentFile = files[i];
        const segment = segments[i];

        // Додаємо сегмент
        content += `file '${segmentFile}'\n`;

        // Генеруємо тишу з тією ж тривалістю що й сегмент (округлено до цілих секунд)
        const silenceDuration = Math.ceil(segment.duration);
        const silenceFile = path.join(TEMP_DIR, `silence_segment_${i}.mp3`);
        await generateSilenceFile(silenceDuration, silenceFile, audioFormat);

        // Додаємо тишу
        content += `file '${silenceFile}'\n`;
    }

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

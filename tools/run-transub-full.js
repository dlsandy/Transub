/**
 * Run full-file transcription via Transub engine-bridge
 * (same path as UI: ensureEngineRunning + CUDA PATH inject + HTTP jobs).
 */
const path = require('path');
const fs = require('fs');
const { loadSettings, saveSettings } = require('../electron/settings-data');
const { runEngineBatch, stopEngineJobs } = require('../electron/engine-bridge');

async function main() {
    const media = process.argv[2] || 'e:\\un\\FNS-235.mp4';
    const mediaPath = path.resolve(media);
    if (!fs.existsSync(mediaPath)) {
        console.error('media missing:', mediaPath);
        process.exit(2);
    }

    const { options } = loadSettings();
    const opts = {
        ...options,
        task: 'transcribe',
        language: 'ja',
        device: 'cuda',
        engineBackend: 'transub',
        engineAsrModel: 'whisper-large-v3-turbo',
        engineVadModel: 'whisperseg-asmr',
        vadEnabled: true,
        vadSensitive: true,
        vadAggressive: false,
        vadThreshold: 0.18,
        vadMinSpeechDurationMs: 60,
        vadMinSilenceDurationMs: 140,
        vadSpeechPadMs: 350,
        vadMaxSingleSegmentMs: 30000,
        hallucinationSilenceThreshold: 4,
        audioLightDenoise: false,
        filmAudioEnhance: false,
        filmVadPreset: false,
        smartTranslate: false,
        beamSize: 5,
        subFormats: 'srt',
        outputMode: 'same',
        overwrite: true,
        engineAutoStart: true,
    };

    // Persist so UI stays aligned with this validated AV profile.
    saveSettings(undefined, { ...options, ...opts });

    console.log('[transub-run] start', mediaPath);
    console.log('[transub-run] asr=', opts.engineAsrModel, 'vadSensitive=', opts.vadSensitive, 'device=', opts.device);

    const result = await runEngineBatch({
        items: [{ fullPath: mediaPath }],
        options: opts,
        invokeSender: null,
        minimizeToTray: false,
    });

    console.log('[transub-run] result', JSON.stringify(result, null, 2));
    const outSrt = path.join(path.dirname(mediaPath), `${path.parse(mediaPath).name}.srt`);
    if (fs.existsSync(outSrt)) {
        const st = fs.statSync(outSrt);
        console.log('[transub-run] srt', outSrt, 'bytes=', st.size, 'mtime=', st.mtime.toISOString());
    } else {
        console.log('[transub-run] srt not found yet at', outSrt);
    }
    process.exit(result && result.ok ? 0 : 1);
}

process.on('SIGINT', () => {
    try { stopEngineJobs(); } catch { /* ignore */ }
    process.exit(130);
});

main().catch((err) => {
    console.error('[transub-run] fatal', err);
    process.exit(1);
});

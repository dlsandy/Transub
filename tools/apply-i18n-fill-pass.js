/**
 * Apply curated hybrid/smart phrases + pending tmp/i18n-fill-*.json into catalogs,
 * then OpenCC-seed missing zh-Hant-TW phrases from zh-Hans.
 *
 *   node tools/apply-i18n-fill-pass.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogDir = path.join(root, 'shared', 'i18n', 'catalog');

function load(id) {
    return JSON.parse(fs.readFileSync(path.join(catalogDir, `${id}.json`), 'utf8'));
}

function writeOrdered(id, pack) {
    const ordered = {};
    Object.keys(pack).filter((k) => !k.startsWith('phrase.')).sort()
        .forEach((k) => { ordered[k] = pack[k]; });
    Object.keys(pack).filter((k) => k.startsWith('phrase.'))
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .forEach((k) => { ordered[k] = pack[k]; });
    fs.writeFileSync(path.join(catalogDir, `${id}.json`), `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

const HYBRID = {
    '混合': {
        en: 'Hybrid',
        ja: 'ハイブリッド',
        ko: '하이브리드',
    },
    '混合 · {s}+{p}': {
        en: 'Hybrid · {s}+{p}',
        ja: 'ハイブリッド · {s}+{p}',
        ko: '하이브리드 · {s}+{p}',
    },
    '混合翻译': {
        en: 'Hybrid translation',
        ja: 'ハイブリッド翻訳',
        ko: '하이브리드 번역',
    },
    '混合翻译 · {short}': {
        en: 'Hybrid translation · {short}',
        ja: 'ハイブリッド翻訳 · {short}',
        ko: '하이브리드 번역 · {short}',
    },
    '混合翻译 · 润色{short}': {
        en: 'Hybrid translation · polish{short}',
        ja: 'ハイブリッド翻訳 · リライト{short}',
        ko: '하이브리드 번역 · 윤문{short}',
    },
    '混合翻译：降级为对话模型按行（需解锁 Pro）': {
        en: 'Hybrid translation: fall back to chat model line-by-line (Pro unlock required)',
        ja: 'ハイブリッド翻訳：対話モデルの行単位に降格（Pro のアンロックが必要）',
        ko: '하이브리드 번역: 대화 모델 줄단위로 강등(Pro 잠금 해제 필요)',
    },
    '智能翻译：对话模型按行（需解锁 Pro）': {
        en: 'Smart translation: chat model line-by-line (Pro unlock required)',
        ja: 'スマート翻訳：対話モデルの行単位（Pro のアンロックが必要）',
        ko: '스마트 번역: 대화 모델 줄단위(Pro 잠금 해제 필요)',
    },
};

function mergeFill(locale, pack) {
    const fillPath = path.join(root, 'tmp', `i18n-fill-${locale}.json`);
    if (!fs.existsSync(fillPath)) return 0;
    const fill = JSON.parse(fs.readFileSync(fillPath, 'utf8'));
    let n = 0;
    Object.entries(fill).forEach(([key, val]) => {
        const k = key.startsWith('phrase.') ? key : `phrase.${key}`;
        const next = String(val || '').trim();
        if (!next) return;
        if (!Object.prototype.hasOwnProperty.call(pack, k) || pack[k] !== next) {
            if (pack[k] !== next) n += 1;
            pack[k] = next;
        }
    });
    return n;
}

function main() {
    const hans = load('zh-Hans');
    const en = load('en');
    const ja = load('ja');
    const ko = load('ko');
    const hant = load('zh-Hant-TW');

    let hybridN = 0;
    Object.entries(HYBRID).forEach(([text, locs]) => {
        const key = `phrase.${text}`;
        if (!Object.prototype.hasOwnProperty.call(hans, key)) hans[key] = text;
        en[key] = locs.en;
        ja[key] = locs.ja;
        ko[key] = locs.ko;
        hybridN += 1;
    });

    const fillEn = mergeFill('en', en);
    const fillJa = mergeFill('ja', ja);
    const fillKo = mergeFill('ko', ko);

    let OpenCC;
    try {
        OpenCC = require('opencc-js').Converter({ from: 'cn', to: 'twp' });
    } catch {
        OpenCC = (s) => s;
    }
    let hantAdded = 0;
    Object.keys(hans).filter((k) => k.startsWith('phrase.')).forEach((k) => {
        if (!Object.prototype.hasOwnProperty.call(hant, k)) {
            hant[k] = OpenCC(String(hans[k]));
            hantAdded += 1;
        }
    });
    // Always refresh hybrid Hant from OpenCC for consistency
    Object.keys(HYBRID).forEach((text) => {
        hant[`phrase.${text}`] = OpenCC(text);
    });

    writeOrdered('zh-Hans', hans);
    writeOrdered('en', en);
    writeOrdered('ja', ja);
    writeOrdered('ko', ko);
    writeOrdered('zh-Hant-TW', hant);
    console.log(`[apply-i18n-fill] hybrid=${hybridN} fill en=${fillEn} ja=${fillJa} ko=${fillKo} hantAdded=${hantAdded}`);
}

main();

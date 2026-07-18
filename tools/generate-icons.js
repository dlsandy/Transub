const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const electronDir = path.join(root, 'electron');

function resolveIconSource() {
    const candidates = [
        path.join(root, 'Transub.png'),
        path.join(electronDir, 'icon-source.png'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

function resolveEditorIconSource() {
    const candidates = [
        path.join(root, 'tseditor.png'),
        path.join(electronDir, 'editor-icon-source.png'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

async function writePngSizes(sharp, source, sizes) {
    for (const { file, size } of sizes) {
        await sharp(source)
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toFile(path.join(electronDir, file));
    }
}

async function main() {
    const source = resolveIconSource();
    if (!source) {
        console.error('[generate-icons] 缺少项目图标：请放置 Transub.png 或 electron/icon-source.png');
        process.exit(1);
    }
    console.log('[generate-icons] 源图:', path.relative(root, source));

    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.error('[generate-icons] 需要 sharp，请运行: npm install --save-dev sharp');
        process.exit(1);
    }

    const sizes = [
        { file: 'icon-16.png', size: 16 },
        { file: 'icon-32.png', size: 32 },
        { file: 'icon-48.png', size: 48 },
        { file: 'icon-256.png', size: 256 },
        { file: 'tray-icon-subtitle-16.png', size: 16 },
        { file: 'tray-icon-subtitle.png', size: 32 },
    ];

    await writePngSizes(sharp, source, sizes);

    const ico = await pngToIco([
        path.join(electronDir, 'icon-16.png'),
        path.join(electronDir, 'icon-32.png'),
        path.join(electronDir, 'icon-48.png'),
        path.join(electronDir, 'icon-256.png'),
    ]);
    fs.writeFileSync(path.join(electronDir, 'app.ico'), ico);
    fs.writeFileSync(path.join(root, 'app.ico'), ico);

    await sharp(source)
        .resize(512, 512, { fit: 'cover' })
        .png()
        .toFile(path.join(electronDir, 'icon-source.png'));

    await sharp(source)
        .resize(32, 32, { fit: 'cover' })
        .png()
        .toFile(path.join(root, 'src', 'icon.png'));

    const editorSource = resolveEditorIconSource();
    if (editorSource) {
        console.log('[generate-icons] 编辑器源图:', path.relative(root, editorSource));
        const editorSizes = [
            { file: 'editor-icon-16.png', size: 16 },
            { file: 'editor-icon-32.png', size: 32 },
            { file: 'editor-icon-48.png', size: 48 },
            { file: 'editor-icon-256.png', size: 256 },
        ];
        await writePngSizes(sharp, editorSource, editorSizes);
        const editorIco = await pngToIco(editorSizes.map((s) => path.join(electronDir, s.file)));
        fs.writeFileSync(path.join(electronDir, 'editor-app.ico'), editorIco);
        await sharp(editorSource)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toFile(path.join(electronDir, 'editor-icon-source.png'));
    } else {
        console.warn('[generate-icons] 未找到 tseditor.png，跳过字幕编辑器图标');
    }

    console.log('[generate-icons] 完成');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

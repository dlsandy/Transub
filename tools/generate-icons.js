const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const electronDir = path.join(root, 'electron');
const source = path.join(electronDir, 'icon-source.png');

async function main() {
    if (!fs.existsSync(source)) {
        console.error('[generate-icons] 缺少 electron/icon-source.png');
        process.exit(1);
    }

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

    for (const { file, size } of sizes) {
        await sharp(source)
            .resize(size, size, { fit: 'cover' })
            .png()
            .toFile(path.join(electronDir, file));
    }

    const ico = await pngToIco([
        path.join(electronDir, 'icon-16.png'),
        path.join(electronDir, 'icon-32.png'),
        path.join(electronDir, 'icon-48.png'),
        path.join(electronDir, 'icon-256.png'),
    ]);
    fs.writeFileSync(path.join(electronDir, 'app.ico'), ico);
    fs.writeFileSync(path.join(root, 'app.ico'), ico);

    await sharp(source)
        .resize(32, 32, { fit: 'cover' })
        .png()
        .toFile(path.join(root, 'src', 'icon.png'));

    console.log('[generate-icons] 完成');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

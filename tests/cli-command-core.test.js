const assert = require('assert');
const cli = require('../src/js/cli-command-core');

describe('cli-command-core', () => {
    const launcher = {
        packaged: true,
        transubExe: 'C:\\Apps\\Transub\\transub.exe',
    };

    it('builds regular command from selected paths', () => {
        const out = cli.buildRegularTransubCommand(launcher, [
            'D:\\Videos\\a.mkv',
            'D:\\Videos\\b.mp4',
        ]);
        assert.ok(out.command.includes('transub.exe'));
        assert.ok(out.command.includes('--files='));
        assert.ok(out.command.includes('a.mkv|D:\\Videos\\b.mp4'));
        assert.strictEqual(out.usesSelection, true);
    });

    it('builds Jasna per-video hook with {output} placeholder', () => {
        const out = cli.buildJasnaTransubCommand(launcher);
        assert.ok(out.command.includes('--files={output}'));
        assert.ok(out.cliExample.includes('--post-export-video-command'));
        assert.ok(out.hint.includes('{output}'));
    });

    it('always uses transub.exe form (never npm) for unpackaged launcher', () => {
        const out = cli.buildRegularTransubCommand({
            packaged: false,
            transubExe: 'D:\\Transub\\transub.exe',
        }, ['D:\\a.mkv']);
        assert.ok(out.command.includes('transub.exe'));
        assert.ok(!out.command.includes('npm'));
        assert.ok(out.command.includes('a.mkv'));
        assert.ok(out.hint.includes('解压/安装目录'));
    });
});

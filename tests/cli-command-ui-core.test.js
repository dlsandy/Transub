'use strict';

const assert = require('assert');
const { createCliCommandUi } = require('../src/js/cli-command-ui-core.js');

describe('TransubCliCommandUi', () => {
    it('exports createCliCommandUi', () => {
        assert.strictEqual(typeof createCliCommandUi, 'function');
    });

    it('renders regular preview into form fields', async () => {
        const els = {
            cliCommandHint: { textContent: '' },
            cliCommandText: { value: '' },
            cliCommandJasnaExampleWrap: { classList: { toggle() {} } },
            cliCommandJasnaExample: { value: '' },
            cliCommandModal: {
                classList: {
                    add() {},
                    remove() {},
                },
            },
            copyCliCommandBtn: { focus() {} },
        };
        const ui = createCliCommandUi({
            els,
            electron: {
                async transubGetCliLauncher() {
                    return { ok: true, packaged: true, transubExe: 'C:\\Apps\\Transub\\transub.exe' };
                },
            },
            cliCommandApi: {
                normalizeCliKind: (v) => (v === 'jasna' ? 'jasna' : 'regular'),
                buildCliCommand: (kind, launcher, paths) => ({
                    kind,
                    command: `cmd ${paths.join('|')}`,
                    hint: 'hint-ok',
                    cliExample: 'example',
                }),
            },
            getSelectedItems: () => [{ path: 'D:\\a.mkv' }],
            queryCheckedKind: () => 'regular',
        });
        await ui.refreshCliCommandPreview();
        assert.strictEqual(els.cliCommandHint.textContent, 'hint-ok');
        assert.ok(els.cliCommandText.value.includes('a.mkv'));
    });

    it('selectedMediaPathsForCli filters blanks', () => {
        const ui = createCliCommandUi({
            getSelectedItems: () => [{ path: 'a.mp4' }, { path: '  ' }, {}],
        });
        assert.deepStrictEqual(ui.selectedMediaPathsForCli(), ['a.mp4']);
    });
});

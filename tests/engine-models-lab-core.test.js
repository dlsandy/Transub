const assert = require('assert');
const lab = require('../src/js/engine-models-lab-core');

describe('engine-models-lab-core', () => {
    it('validates laboratory add form', () => {
        assert.strictEqual(lab.buildLabAddPayloadFromForm({}).ok, false);
        assert.strictEqual(
            lab.buildLabAddPayloadFromForm({ fileName: 'nope.bin' }).ok,
            false,
        );
        const fromFile = lab.buildLabAddPayloadFromForm({
            name: 'Mine',
            fileName: 'mine-Q5.gguf',
            paramBillion: '3',
        });
        assert.ok(fromFile.ok);
        assert.strictEqual(fromFile.payload.fileName, 'mine-Q5.gguf');
        assert.strictEqual(fromFile.payload.paramBillion, 3);
        const fromUrl = lab.buildLabAddPayloadFromForm({
            ggufUrl: 'https://huggingface.co/x/resolve/main/a.gguf',
        });
        assert.ok(fromUrl.ok);
        assert.ok(fromUrl.payload.ggufUrl.includes('a.gguf'));
    });
});

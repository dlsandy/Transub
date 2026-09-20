'use strict';

const assert = require('assert');
const station = require('../electron/transub-station-client');

describe('transub-station-client', () => {
    it('normalizes station root URL', () => {
        assert.strictEqual(station.normalizeStationUrl(''), 'http://127.0.0.1:8787');
        assert.strictEqual(station.normalizeStationUrl('127.0.0.1:8787'), 'http://127.0.0.1:8787');
        assert.strictEqual(
            station.normalizeStationUrl('http://192.168.31.107:8787/v1'),
            'http://192.168.31.107:8787',
        );
        assert.strictEqual(
            station.normalizeStationUrl('http://192.168.31.107:8787/v1/'),
            'http://192.168.31.107:8787',
        );
        assert.strictEqual(
            station.normalizeStationUrl('https://station.local/api'),
            'https://station.local',
        );
    });

    it('parses client config payload', () => {
        const parsed = station.parseClientConfig({
            ready: true,
            openai_base_url: 'http://127.0.0.1:8787/v1',
            model: 'Sakura-Galtransl-14B-v3.8',
            api_key: 'transub',
            temperature: 0.3,
            top_p: 0.8,
            max_concurrency: 4,
        });
        assert.strictEqual(parsed.ok, true);
        assert.strictEqual(parsed.ready, true);
        assert.strictEqual(parsed.openaiBaseUrl, 'http://127.0.0.1:8787/v1');
        assert.strictEqual(parsed.model, 'Sakura-Galtransl-14B-v3.8');
        assert.strictEqual(parsed.apiKey, 'transub');
        assert.strictEqual(parsed.maxConcurrency, 4);
        assert.strictEqual(parsed.temperature, 0.3);
        assert.strictEqual(parsed.topP, 0.8);
    });

    it('parses openai-style models list', () => {
        const list = station.parseModelsListBody({
            data: [{ id: 'a', name: 'Model A' }, { id: 'b' }],
        });
        assert.deepStrictEqual(list.map((m) => m.id), ['a', 'b']);
        assert.strictEqual(list[0].name, 'Model A');
    });

    it('builds openai models url', () => {
        assert.strictEqual(
            station.openaiModelsUrl('http://127.0.0.1:8787/v1'),
            'http://127.0.0.1:8787/v1/models',
        );
        assert.strictEqual(
            station.openaiModelsUrl('http://127.0.0.1:8787'),
            'http://127.0.0.1:8787/v1/models',
        );
    });

    it('prefers preferred model in resolveStationSentenceMtEndpoint shape via parse', () => {
        const opts = station.normalizeStationOptions({
            transubStationEnabled: true,
            transubStationUrl: 'http://127.0.0.1:8787',
            transubStationModel: 'pick-me',
        });
        assert.strictEqual(opts.transubStationModel, 'pick-me');
    });

    it('selectStationModel rejects empty model id', async () => {
        const res = await station.selectStationModel({ model: '  ' });
        assert.strictEqual(res.ok, false);
        assert.ok(res.error);
    });

    it('parses /api/models/active payloads', () => {
        assert.deepStrictEqual(
            station.parseActiveModelBody({
                model_id: 'galtransl-14b-v3.8-q4km',
                name: 'Sakura-Galtransl-14B-v3.8',
                ready: true,
            }),
            {
                id: 'galtransl-14b-v3.8-q4km',
                name: 'Sakura-Galtransl-14B-v3.8',
                ready: true,
            },
        );
        assert.strictEqual(
            station.parseActiveModelBody({ model: 'Sakura-Galtransl-14B-v3.8' }).id,
            'Sakura-Galtransl-14B-v3.8',
        );
        assert.strictEqual(
            station.parseActiveModelBody({
                active: { id: 'galtransl-7b-v3.7-iq4', ready: false },
            }).id,
            'galtransl-7b-v3.7-iq4',
        );
    });
});

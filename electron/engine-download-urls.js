/**
 * Hub URL helpers for Engine model downloads.
 */
function normalizeHfEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '') || 'https://hf-mirror.com';
}

/**
 * Resolve Hub endpoint for a download / ensure call.
 * Empty string from the Models form must not wipe a saved mirror
 * (`payload.hfEndpoint: ''` used to force official huggingface.co and fail in CN).
 *
 * @param {unknown} payloadEndpoint
 * @param {unknown} optionsEndpoint
 */
function resolveHfEndpointForDownload(payloadEndpoint, optionsEndpoint) {
    const fromPayload = payloadEndpoint == null
        ? ''
        : String(payloadEndpoint).trim().replace(/\/+$/, '');
    if (fromPayload) return fromPayload;
    const fromOptions = optionsEndpoint == null
        ? ''
        : String(optionsEndpoint).trim().replace(/\/+$/, '');
    if (fromOptions) return fromOptions;
    return normalizeHfEndpoint('');
}

function buildHubUrls(hubId, hfEndpoint) {
    const id = String(hubId || '').trim();
    if (!id) return { officialUrl: '', mirrorUrl: '' };
    const mirror = normalizeHfEndpoint(hfEndpoint);
    return {
        officialUrl: `https://huggingface.co/${id}`,
        mirrorUrl: `${mirror}/${id}`,
    };
}

module.exports = {
    normalizeHfEndpoint,
    resolveHfEndpointForDownload,
    buildHubUrls,
};

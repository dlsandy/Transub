/**
 * Hub URL helpers for Engine model downloads.
 */
function normalizeHfEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '') || 'https://hf-mirror.com';
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
    buildHubUrls,
};

// A shared route label, never a visitor identifier. No storage or network access.
(() => {
    const url = new URL(window.location.href);
    const allowed = new Set(['ff_campaign', 'gclid', 'gbraid', 'wbraid', 'utm_source',
        'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id']);
    const code = url.searchParams.get('ff_campaign');
    if (!['/', '/index.html'].includes(url.pathname) || url.hash ||
        url.searchParams.getAll('ff_campaign').length !== 1 ||
        !/^[a-z][a-z0-9_-]{2,39}$/.test(code || '') || code === 'unknown' ||
        [...url.searchParams.keys()].some(key => !allowed.has(key))) return;
    window.FFInternalCampaign = code;
})();

/* Exact marketing navigation bridge. It never creates an auth/QR route or writes storage. */
(function (w) {
    const url = new URL(w.location.href), params = url.searchParams;
    const tracking = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'];
    const controls = ['ff_entry', 'ff_action', 'ff_cta', 'ff_unattributed'];
    if (!['/', '/index.html'].includes(url.pathname) || url.hash
        || params.get('ff_entry') !== 'restaurants'
        || !['signup', 'demo'].includes(params.get('ff_action'))
        || !['hero', 'product', 'pricing', 'final'].includes(params.get('ff_cta'))
        || controls.some(key => params.getAll(key).length > 1)
        || (params.has('ff_unattributed') && params.get('ff_unattributed') !== '1')
        || [...params.keys()].some(key => !tracking.includes(key) && !controls.includes(key))) return;
    const action = params.get('ff_action'), cta = params.get('ff_cta');
    const eligible = !params.has('ff_unattributed');
    controls.forEach(key => params.delete(key));
    url.pathname = '/restaurants/';
    w.FFMarketingEntry = Object.freeze({ action, cta, eligible, url: url.href });
})(window);

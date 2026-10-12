/* Navigation only: no campaign storage, identifiers, requests or click events. */
(function () {
    const supported = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid']);
    const params = new URLSearchParams(location.search);
    const eligible = [...params.keys()].every(key => supported.has(key));
    for (const link of document.querySelectorAll('[data-restaurant-action]')) {
        // Copy the query verbatim; do not interpret campaign values before consent.
        link.href += eligible ? (location.search ? '&' + location.search.slice(1) : '') : '&ff_unattributed=1';
    }
})();

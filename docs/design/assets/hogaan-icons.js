/* ============================================================
   HOGAAN — Icon set
   Lifted verbatim from the production app
   (muhsinwarfa/hogaan, web/src/components/Icons.tsx + Primitives.tsx).
   Hand-drawn line icons, NO external icon library. Stroke 1.6–1.9,
   round caps + joins, 24×24 viewBox, currentColor stroke.

   Usage (vanilla):
     el.innerHTML = HogaanIcons.send;            // raw <svg> string
     HogaanIcon('mic', { size: 20 });            // returns sized <svg> string
   ============================================================ */
(function (global) {
  // Each entry is the INNER markup of a 24×24 viewBox icon (currentColor stroke).
  const PATHS = {
    back:      '<path d="M15 18l-6-6 6-6"/>',
    arrow:     '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check:     '<path d="M4 12l5 5L20 6"/>',
    close:     '<path d="M6 6l12 12M6 18L18 6"/>',
    menu:      '<path d="M4 7h16M4 12h16M4 17h10"/>',
    search:    '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    mic:       '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    send:      '<path d="M5 12l15-8-5 18-3-7-7-3z"/>',
    moon:      '<path d="M20 14.5A8 8 0 1 1 9.5 4a6 6 0 0 0 10.5 10.5z"/>',
    bookmark:  '<path d="M6 4h12v17l-6-4-6 4z"/>',
    spark:     '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    shield:    '<path d="M12 3l8 3v6a8 8 0 0 1-8 8 8 8 0 0 1-8-8V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    envelope:  '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M4 7l8 6 8-6"/>',
    edit:      '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    download:  '<path d="M12 4v12"/><path d="M6 12l6 6 6-6"/><path d="M4 20h16"/>',
    eye:       '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:    '<path d="M2 12s3.5-7 10-7c2.3 0 4.2.8 5.8 1.9"/><path d="M22 12s-3.5 7-10 7c-2.3 0-4.2-.8-5.8-1.9"/><path d="M3 3l18 18"/>',
    // Nav (22×22 use)
    home:      '<path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z"/>',
    sessions:  '<path d="M21 12a9 9 0 1 1-3.2-6.9"/><path d="M12 7v5l3 2"/>',
    profile:   '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  };

  function icon(name, opts) {
    const o = opts || {};
    const size = o.size || 22;
    const sw = o.stroke || 1.7;
    const inner = PATHS[name];
    if (!inner) return '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  // Pre-rendered string map at default size for convenience
  const map = {};
  Object.keys(PATHS).forEach((k) => { map[k] = icon(k); });

  global.HogaanIcons = map;
  global.HogaanIcon = icon;
  global.HogaanIconNames = Object.keys(PATHS);
})(window);

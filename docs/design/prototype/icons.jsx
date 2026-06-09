// Transforma icon set — composed in Hogaan's hand-drawn line style.
// 24x24 viewBox, fill none, stroke currentColor, width 1.7, round caps/joins.
// Hogaan's own glyphs are reused verbatim; the rest are NEW extensions
// authored to match (clipboard, inbox, calendar, roster, reports, bell, etc.).
const TS = (w = 1.7) => ({ fill: 'none', stroke: 'currentColor', strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round' });
const Svg = ({ s = 22, sw = 1.7, children }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" {...TS(sw)}>{children}</svg>
);

// --- nav / structural ---
const IcoHome   = (p) => <Svg {...p}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" fill={p.active ? 'currentColor' : 'none'} fillOpacity={p.active ? 0.12 : 0} /></Svg>;
const IcoReview = (p) => <Svg {...p}><path d="M9 4h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2V5a1 1 0 0 1 1-1z" /><path d="M9 12l2 2 4-4" /></Svg>;
const IcoPeer   = (p) => <Svg {...p}><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8 9.5h8M8 12.5h5" /></Svg>;
const IcoApprovals = (p) => <Svg {...p}><path d="M4 4h16v9a2 2 0 0 1-2 2h-5l-3 3v-3H6a2 2 0 0 1-2-2V4z" /><path d="M9 9l2 2 4-4" /></Svg>;
const IcoCycles = (p) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9h17M8 3.5v3M16 3.5v3" /><path d="M8 13l2.2 2.2L15 11" /></Svg>;
const IcoRoster = (p) => <Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6" /><path d="M17.5 19a5.5 5.5 0 0 0-3-4.9" /></Svg>;
const IcoReports = (p) => <Svg {...p}><path d="M4 20h16" /><rect x="6" y="11" width="3.2" height="6" rx="0.8" /><rect x="11.4" y="7" width="3.2" height="10" rx="0.8" /><rect x="16.8" y="13" width="3.2" height="4" rx="0.8" /></Svg>;

// --- chrome ---
const IcoBell   = (p) => <Svg {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 19a2 2 0 0 0 4 0" /></Svg>;
const IcoSearch = (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>;
const IcoMenu   = (p) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h10" /></Svg>;
const IcoClose  = (p) => <Svg {...p}><path d="M6 6l12 12M6 18L18 6" /></Svg>;
const IcoChevDown  = (p) => <Svg {...p} sw={p.sw || 2}><path d="M6 9l6 6 6-6" /></Svg>;
const IcoChevRight = (p) => <Svg {...p} sw={p.sw || 2}><path d="M9 6l6 6-6 6" /></Svg>;
const IcoChevLeft  = (p) => <Svg {...p} sw={p.sw || 2}><path d="M15 6l-6 6 6 6" /></Svg>;
const IcoArrowRight= (p) => <Svg {...p} sw={p.sw || 2}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
const IcoPlus   = (p) => <Svg {...p} sw={p.sw || 2}><path d="M12 5v14M5 12h14" /></Svg>;
const IcoSettings = (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>;
const IcoLogout = (p) => <Svg {...p}><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M16 16l4-4-4-4M20 12H10" /></Svg>;
const IcoUser   = (p) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>;
const IcoMail   = (p) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></Svg>;
const IcoClock  = (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
const IcoSwitch = (p) => <Svg {...p}><path d="M7 4L3 8l4 4" /><path d="M3 8h13a4 4 0 0 1 4 4" /><path d="M17 20l4-4-4-4" /><path d="M21 16H8a4 4 0 0 1-4-4" /></Svg>;

// --- status / feedback ---
const IcoCheck  = (p) => <Svg {...p} sw={p.sw || 2.4}><path d="M4 12l5 5L20 6" /></Svg>;
const IcoCheckCircle = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12l2.5 2.5L16 9" /></Svg>;
const IcoLock   = (p) => <Svg {...p}><rect x="5" y="10.5" width="14" height="9" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" /></Svg>;
const IcoFlag   = (p) => <Svg {...p}><path d="M5 21V4" /><path d="M5 4.5h11l-2 3.5 2 3.5H5" /></Svg>;
const IcoAlert  = (p) => <Svg {...p}><path d="M12 3l9.5 16.5H2.5L12 3z" /><path d="M12 10v4M12 17.5h.01" /></Svg>;
const IcoInfo   = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
const IcoXCircle= (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></Svg>;
const IcoInbox  = (p) => <Svg {...p}><path d="M3 13l3-8h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /><path d="M3 13h5a2 2 0 0 0 4 0h0a2 2 0 0 0 4 0h5" /></Svg>;
const IcoSpark  = (p) => <Svg {...p} sw={1.6}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Svg>;
const IcoEye    = (p) => <Svg {...p}>{p.off
  ? <><path d="M2 12s3.5-7 10-7c2.3 0 4.2.8 5.8 1.9" /><path d="M22 12s-3.5 7-10 7c-2.3 0-4.2-.8-5.8-1.9" /><path d="M3 3l18 18" /></>
  : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}</Svg>;
const IcoSpinner = (p) => <svg className="spinner" width={p.s || 22} height={p.s || 22} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.6" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>;
const IcoMore   = (p) => <Svg {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></Svg>;
const IcoDoc    = (p) => <Svg {...p}><path d="M6 3h8l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3z" /><path d="M14 3v4h4" /><path d="M8.5 12h7M8.5 15.5h7M8.5 19h4" /></Svg>;
const IcoEdit   = (p) => <Svg {...p}><path d="M4 20h4l10-10a2 2 0 0 0-2.8-2.8L5 17.5 4 20z" /><path d="M13.5 6.5l4 4" /></Svg>;
const IcoShield = (p) => <Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 11.5l2 2 4-4" /></Svg>;
const IcoScale  = (p) => <Svg {...p}><path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 5a3 3 0 0 0 5 0L5 8zM19 8l-2.5 5a3 3 0 0 0 5 0L19 8z" /><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" /></Svg>;
const IcoDownload = (p) => <Svg {...p}><path d="M12 4v11M7 11l5 5 5-5" /><path d="M5 20h14" /></Svg>;
const IcoSaved  = (p) => <Svg {...p}><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7" /><path d="M9 14.5l2 2 4-4" /></Svg>;
const IcoUpload = (p) => <Svg {...p}><path d="M12 16V5M7 10l5-5 5 5" /><path d="M4 20h16" /></Svg>;
const IcoCsv    = (p) => <Svg {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M8 13h1.5M8 17h1.5M13 13l2.5 4M15.5 13L13 17" /></Svg>;
const IcoScales = (p) => <Svg {...p}><path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 5a3 3 0 0 0 5 0L5 8zM19 8l-2.5 5a3 3 0 0 0 5 0L19 8z" /></Svg>;
const IcoUsers  = (p) => <Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6" /><path d="M17.5 19a5.5 5.5 0 0 0-3-4.9" /></Svg>;

// Brand lockup — TRANSFORMA is the persistent product mark. Workspace context
// (the review cycle) sits quietly beneath it. No tenant company name is shown.
function TenantLogo({ small = false, workspace }) {
  const ws = workspace || (typeof TENANT !== 'undefined' ? TENANT.cycle : '');
  return (
    <div className="tenant-logo" data-small={small ? 'true' : 'false'}>
      <span className="mark" aria-hidden="true">T</span>
      <span className="brand-stack">
        <span className="ten-name">Transforma<span className="brand-dot" aria-hidden="true"></span></span>
        <span className="ten-product">{ws}</span>
      </span>
    </div>
  );
}

Object.assign(window, {
  IcoHome, IcoReview, IcoPeer, IcoApprovals, IcoCycles, IcoRoster, IcoReports,
  IcoBell, IcoSearch, IcoMenu, IcoClose, IcoChevDown, IcoChevRight, IcoChevLeft,
  IcoArrowRight, IcoPlus, IcoSettings, IcoLogout, IcoUser, IcoMail, IcoClock, IcoSwitch,
  IcoCheck, IcoCheckCircle, IcoLock, IcoFlag, IcoAlert, IcoInfo, IcoXCircle, IcoInbox,
  IcoSpark, IcoEye, IcoSpinner, IcoMore, IcoDoc, IcoEdit, IcoShield, IcoScale, IcoDownload, IcoSaved, IcoUpload, IcoCsv, IcoScales, IcoUsers, TenantLogo,
});

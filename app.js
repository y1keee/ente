'use strict';

/* ---------- Hilfsfunktionen ---------- */
const $ = s => document.querySelector(s);
const pad2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diff = (a, b) => Math.round((b - a) / 864e5);
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const fmt = (d, o = { weekday: 'short', day: 'numeric', month: 'long' }) => d.toLocaleDateString('de-DE', o);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Kurze Vibration als Rückmeldung (nur auf Handys, die das können)
const buzz = p => { try { if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(p); } catch {} };
// CSS-Animation neu starten
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

const FLOW = ['Keine', 'Leicht', 'Mittel', 'Stark'];
const SYMPTOMS = ['Krämpfe', 'Kopfschmerzen', 'Rückenschmerzen', 'Brustspannen', 'Blähbauch', 'Pickel', 'Übelkeit', 'Müdigkeit', 'Heißhunger', 'Schlafprobleme'];
const MOODS = [['😊', 'Glücklich'], ['😌', 'Entspannt'], ['😐', 'Okay'], ['😢', 'Traurig'], ['😤', 'Gereizt'], ['😰', 'Gestresst']];
const ENERGY = ['Wenig', 'Normal', 'Viel'];
const VIEWS = ['home', 'cal', 'more'];
const TITLES = { cal: 'Kalender', more: 'Übersicht' };

/* ---------- Icons ---------- */
const ICONS = {
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pill: '<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M9.2 9.2l5.6 5.6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  save: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
  back: '<path d="M9 5.5h9.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9L3 12z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const DROP = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2.5c3.2 3.9 6 7.1 6 10.800a6 6 0 0 1-12 0c0-3.700 2.800-6.900 6-10.800z"/></svg>';
const drops = n => `<span class="drops ${n ? '' : 'none'}">${DROP.repeat(n || 1)}</span>`;
const level = n => `<svg class="lvl" viewBox="0 0 24 20" aria-hidden="true">${[0, 1, 2].map(i => `<rect x="${3 + i * 7}" y="${12 - i * 5}" width="4.5" height="${7 + i * 5}" rx="2.2" class="${i < n ? 'f' : ''}"/>`).join('')}</svg>`;

/* ---------- Daten (nur lokal auf dem Gerät) ---------- */
const STORE = 'ente-daten-v1';
const HINT = 'ente-ring-hinweis';
let db = load();
let view = 'home';
let month = (() => { const t = today(); return new Date(t.getFullYear(), t.getMonth(), 1); })();

function load() {
  const def = { days: {}, settings: { pill: false, pinHash: null, pinSalt: null } };
  try {
    const d = JSON.parse(localStorage.getItem(STORE));
    if (d && typeof d.days === 'object') return { days: d.days, settings: Object.assign(def.settings, d.settings) };
  } catch {}
  return def;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(db)); }
  catch { toast('Speichern hat nicht geklappt'); }
}
const isPeriod = k => (db.days[k]?.flow || 0) > 0;

/* ---------- Zyklus-Berechnung ---------- */
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Blutungstage zu Perioden zusammenfassen (ein Tag Lücke ist erlaubt).
// Eine Blutung, die weniger als 15 Tage nach dem letzten Periodenstart beginnt,
// gilt als Zwischenblutung und startet keinen neuen Zyklus.
function periods() {
  const groups = [];
  for (const d of Object.keys(db.days).filter(isPeriod).sort().map(parse)) {
    const last = groups[groups.length - 1];
    if (last && diff(last.end, d) <= 2) last.end = d; else groups.push({ start: d, end: d });
  }
  const res = [];
  for (const g of groups) {
    const last = res[res.length - 1];
    if (!last || diff(last.start, g.start) >= 15) res.push(g);
  }
  return res;
}

function analyse() {
  const t = today();
  const p = periods();
  // Zyklus = Abstand zwischen zwei Periodenstarts. Mehr als 60 Tage gilt als Lücke in den Einträgen.
  const cycles = p.map((x, i) => p[i + 1] ? { start: x.start, len: diff(x.start, p[i + 1].start) } : null)
    .filter(c => c && c.len <= 60);
  // Die letzten sechs Zyklen zählen. Ab drei Zyklen wird ein auffällig langer nicht mitgerechnet:
  // dann fehlt vermutlich ein Eintrag, und er würde die Vorhersage monatelang verfälschen.
  const recent = cycles.slice(-6);
  if (recent.length >= 3) {
    const md = median(recent.map(c => c.len));
    recent.forEach(c => { c.out = c.len > md * 1.6; });
  }
  const lens = recent.filter(c => !c.out).map(c => c.len);
  const span = lens.length ? Math.max(...lens) - Math.min(...lens) : 0;
  // Periodendauer: nur abgeschlossene Perioden (letzte Blutung liegt mindestens zwei Tage zurück)
  const lastP = p[p.length - 1];
  const running = !!lastP && diff(lastP.end, t) <= 1;
  const durs = p.filter(x => diff(x.end, t) > 1).slice(-6).map(x => diff(x.start, x.end) + 1);
  const r = {
    p, cycles, recent,
    // Mittlerer Wert (Median) statt Durchschnitt: ein einzelner Ausreißer verschiebt ihn nicht
    cyc: lens.length ? Math.round(median(lens)) : 28,
    dur: durs.length ? Math.round(median(durs)) : 5,
    known: lens.length,
    outliers: recent.length - lens.length,
    // Erwartbare Abweichung in Tagen, aus der Schwankung ihrer Zyklen
    pm: lens.length >= 3 ? Math.min(Math.max(Math.ceil(span / 2), 1), 6) : 3,
    regular: lens.length < 3 ? null : span <= 3 ? 'Sehr regelmäßig' : span <= 7 ? 'Regelmäßig' : 'Unregelmäßig',
    pred: new Set(), fert: new Set(), ovu: new Set(), starts: [],
  };
  if (!lastP) return r;
  const last = lastP.start;
  r.last = last;
  r.next = addDays(last, r.cyc);   // rechnerisch erwarteter Start
  r.cycleDay = diff(last, t) + 1;
  r.until = diff(t, r.next);
  r.late = r.until < 0;            // überfällig
  // Läuft die Periode noch, die erwarteten Resttage markieren
  if (running) for (let d = addDays(lastP.end, 1); d <= addDays(last, r.dur - 1); d = addDays(d, 1)) if (d >= t) r.pred.add(iso(d));
  // Ist sie überfällig, wandert die Erwartung auf heute mit, statt in der Vergangenheit zu bleiben
  const base = r.late ? t : r.next;
  for (let k = 0; k < 4; k++) {
    const s = addDays(base, k * r.cyc);
    r.starts.push(s);
    for (let i = 0; i < r.dur; i++) r.pred.add(iso(addDays(s, i)));
    const o = addDays(s, -14);     // Eisprung etwa 14 Tage vor der nächsten Periode
    r.ovu.add(iso(o));
    for (let i = -5; i <= 1; i++) r.fert.add(iso(addDays(o, i)));  // fruchtbar: 5 Tage davor bis 1 Tag danach
  }
  return r;
}

// Phase für einen Zyklustag (idx 0 = erster Tag der Periode): [Schlüssel, Text]
function phaseAt(idx, a) {
  const ov = a.cyc - 14;
  if (idx < a.dur) return ['period', 'Periode'];
  if (idx === ov) return ['fertile', 'Eisprung (geschätzt)'];
  if (idx >= ov - 5 && idx <= ov + 1) return ['fertile', 'Fruchtbare Tage'];
  return idx < ov ? ['follicular', 'Follikelphase'] : ['luteal', 'Lutealphase'];
}
function phaseToday(a) {
  if (!a.p.length) return null;
  if (isPeriod(iso(today()))) return ['period', 'Periode'];
  if (a.until < 0) return ['luteal', 'Periode überfällig'];
  const ph = phaseAt(a.cycleDay - 1, a);
  return ph[0] === 'period' ? ['follicular', 'Follikelphase'] : ph;
}

// CSS-Klasse für einen Tag: eingetragene Blutung, sonst Vorhersage (nur ab heute)
function dayState(k, d, a, t) {
  const e = db.days[k];
  if (e?.flow) return 'f' + e.flow;
  if (e?.spot) return 'spot';
  if (d >= t) {
    if (a.pred.has(k)) return 'pred';
    if (a.ovu.has(k)) return 'ovu';
    if (a.fert.has(k)) return 'fert';
  }
  return '';
}

/* ---------- Ansicht: Heute ---------- */
const R = 88, CIRC = 2 * Math.PI * R;
// Mittelpunkt des Ring-Segments für Zyklustag idx
const ringPos = (idx, n) => {
  const ang = (idx + 0.5) / n * 2 * Math.PI - Math.PI / 2;
  return [100 + R * Math.cos(ang), 100 + R * Math.sin(ang)];
};

function ringSvg(a) {
  const has = a.p.length > 0, n = a.cyc, seg = CIRC / n;
  const round = seg >= 13, w = round ? 8 : 6;
  const dash = Math.max(round ? seg - w - 2.4 : seg - 2.4, 1);
  const ov = n - 14;
  // Farbe der Perioden-Segmente als Inline-Style, weil CSS sonst das stroke-Attribut überschreibt
  const one = (i, cls, css = '') => `<circle class="sg ${cls}" style="--i:${i};${css}" cx="100" cy="100" r="${R}" stroke-width="${w}" stroke-linecap="${round ? 'round' : 'butt'}" stroke-dasharray="${dash} ${CIRC - dash}" stroke-dashoffset="${-(i * seg + (seg - dash) / 2)}"/>`;
  let rest = '', per = '';
  for (let i = 0; i < n; i++) {
    if (has && i < a.dur) per += one(i, 'p', 'stroke:url(#gp)');
    else rest += one(i, !has ? '' : i === ov ? 'o' : i >= ov - 5 && i <= ov + 1 ? 'f' : i < a.cycleDay - 1 ? 'gone' : '');
  }
  let knob = '';
  if (has) {
    const [x, y] = ringPos(Math.min(Math.max(a.cycleDay - 1, 0), n - 1), n);
    knob = `<g class="knob-g" transform="translate(${x} ${y})"><circle class="knob-halo" r="10"/><circle class="knob" r="9"/><circle class="knob-hit" r="24"/></g>`;
  }
  return `<svg viewBox="0 0 200 200">
    <defs>
      <linearGradient id="gp" gradientUnits="userSpaceOnUse" x1="40" y1="20" x2="170" y2="170"><stop offset="0" stop-color="#ffa9c9"/><stop offset="1" stop-color="#e8457f"/></linearGradient>
      <radialGradient id="gd" cx=".32" cy=".26" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity=".03"/></radialGradient>
    </defs>
    <circle class="disc" cx="100" cy="100" r="68"/>
    <g transform="rotate(-90 100 100)">${rest}<g class="sgs-p">${per}</g></g>
    ${knob}
  </svg>`;
}

function renderHome(a) {
  const t = today(), k = iso(t), e = db.days[k] || {};
  const has = a.p.length > 0;
  const periodNow = isPeriod(k);

  // Text in der Ringmitte
  let center;
  if (!has) center = `<img src="duck.svg" alt=""><div class="ring-small">Trag deine letzte Periode ein, dann rechne ich los</div>`;
  else {
    let label, big, small, word = false, num = '';
    if (periodNow) { label = 'Periode'; big = `Tag ${diff(a.p[a.p.length - 1].start, t) + 1}`; small = `von ca. ${a.dur}`; word = true; }
    else if (a.until > 0) { label = 'Periode in'; big = a.until; num = ` data-n="${a.until}"`; small = a.until === 1 ? 'Tag' : 'Tagen'; }
    else if (a.until === 0) { label = 'Periode'; big = 'Heute'; small = 'erwartet'; word = true; }
    else { label = 'Später als erwartet'; big = `+${-a.until}`; small = -a.until === 1 ? 'Tag' : 'Tage'; }
    center = `<div class="ring-label">${label}</div><div class="ring-big ${word ? 'word' : ''}"${num}>${big}</div><div class="ring-small">${small}</div>`;
  }

  const ph = phaseToday(a);
  const phase = ph ? `<div class="phase"><i class="dot ${ph[0] === 'period' ? 'p' : ph[0] === 'fertile' ? 'y' : ''}"></i>${ph[1]}</div><br>` : '';

  const week = [-3, -2, -1, 0, 1, 2, 3].map(o => {
    const d = addDays(t, o), dk = iso(d);
    return `<button data-d="${dk}" class="${o === 0 ? 'now' : ''}" ${o > 0 ? 'disabled' : ''} aria-label="${fmt(d)}">
      <span>${fmt(d, { weekday: 'short' }).replace('.', '')}</span><span class="num ${dayState(dk, d, a, t)}">${d.getDate()}</span></button>`;
  }).join('');

  const banners = [];
  if (has && !periodNow) {
    if (a.until >= 1 && a.until <= 3) banners.push(`<div class="glass banner"><i class="bi">${ic('bell')}</i><span>Deine Periode kommt ${a.until === 1 ? 'morgen' : `in ${a.until} Tagen`}. Denk an Binden oder Tampons.</span></div>`);
    if (a.until < -3 && a.until >= -7) banners.push(`<div class="glass banner"><i class="bi">${ic('clock')}</i><span>Deine Periode ist ${-a.until} Tage später als erwartet. Das kommt vor, zum Beispiel durch Stress.</span></div>`);
    if (a.until < -7) banners.push(`<div class="glass banner"><i class="bi">${ic('clock')}</i><span>Deine Periode ist ${-a.until} Tage später als erwartet. Das kann viele Gründe haben. Bleibt sie länger aus, bringt ein Test oder ein Arztbesuch Klarheit.</span></div>`);
  }
  if (db.settings.pill && !e.pill) banners.push(`<div class="glass banner"><i class="bi">${ic('pill')}</i><span>Pille heute schon genommen?</span><button data-act="pill">Erledigt</button></div>`);

  const tags = [];
  if (e.flow) tags.push('Blutung: ' + FLOW[e.flow]);
  if (e.spot) tags.push('Schmierblutung');
  if (e.mood) { const m = MOODS.find(x => x[1] === e.mood); tags.push(m ? m.join(' ') : e.mood); }
  if (e.energy) tags.push('Energie: ' + e.energy);
  (e.symptoms || []).forEach(s => tags.push(s));
  if (e.pill) tags.push('Pille genommen');
  if (e.note) tags.push('Notiz');

  // Ausblick: die nächsten Termine, nach Datum sortiert
  let outlook = '';
  if (has) {
    const short = d => fmt(d, { day: 'numeric', month: 'short' });
    const range = (s, e2) => s.getMonth() === e2.getMonth() ? `${s.getDate()}. – ${short(e2)}` : `${short(s)} – ${short(e2)}`;
    let rows, foot;
    if (a.late) {
      // Überfällig: alles Weitere hängt davon ab, wann die Periode kommt
      rows = [[t, 'p', 'Periode überfällig', `seit ${plural(-a.until, 'Tag', 'Tagen')}`]];
      foot = 'Sobald du die Periode einträgst, rechne ich die nächsten Termine neu.';
    } else {
      const ov = a.starts.map(s => addDays(s, -14)).find(o => o >= t);
      rows = [
        [a.starts[0], 'p', 'Nächste Periode', range(a.starts[0], addDays(a.starts[0], a.dur - 1))],
        [addDays(ov, -5), 'y', 'Fruchtbare Tage', range(addDays(ov, -5), addDays(ov, 1))],
        [ov, 'y', 'Eisprung (geschätzt)', short(ov)],
      ].sort((x, y) => x[0] - y[0]);
      foot = a.known >= 3
        ? `Deine Zyklen schwanken um etwa ± ${plural(a.pm, 'Tag', 'Tage')}. So weit kann die Vorhersage abweichen.`
        : 'Noch eine grobe Schätzung. Sie wird mit jeder eingetragenen Periode genauer.';
    }
    outlook = `<div class="glass card"><h2>Ausblick</h2><ul class="outlook">${rows.map(r => `<li><i class="dot ${r[1]}"></i><span>${r[2]}</span><b>${r[3]}</b></li>`).join('')}</ul><p class="foot">${foot}</p></div>`;
  }

  let hint = '';
  try { if (has && !localStorage.getItem(HINT)) hint = '<p class="ring-hint">Zieh den Punkt am Ring, um durch den Zyklus zu blättern</p>'; } catch {}

  // Zwei Spalten: am Handy untereinander, am PC nebeneinander
  $('#view-home').innerHTML = `
    <div class="col">
    <div class="glass card hero">
      ${phase}
      <div class="ring">${ringSvg(a)}<div class="ring-text">${center}</div></div>
      ${has ? `
      <div class="ring-legend"><span><i class="dot p"></i>Periode</span><span><i class="dot y"></i>Fruchtbar</span><span><i class="dot o"></i>Heute</span></div>
      ${hint}
      <div class="trio">
        <div><b>${a.cycleDay}</b><span>Zyklustag</span></div>
        <div><b>${fmt(a.next, { day: 'numeric', month: 'short' })}</b><span>Nächste Periode</span></div>
        <div><b>${a.cyc} Tage</b><span>Ø Zyklus</span></div>
      </div>` : `<button class="primary" data-act="start">Letzte Periode eintragen</button>`}
    </div>
    </div>
    <div class="col">
    <div class="glass week">${week}</div>
    ${banners.join('')}
    <div class="glass card">
      <h2>Heute</h2>
      ${tags.length ? `<div class="summary">${tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : '<p class="muted">Noch nichts eingetragen.</p>'}
      <button class="primary" data-act="today">${tags.length ? 'Bearbeiten' : 'Heute eintragen'}</button>
    </div>
    ${outlook}
    </div>
    <div class="col mini">
      <div class="glass frost card"><div class="cal-nav"><strong>${monthName(t)}</strong></div>${WDS}<div class="grid">${calGrid(a, new Date(t.getFullYear(), t.getMonth(), 1))}</div></div>
    </div>`;
}

// Zahl im Ring hochzählen lassen
function countUp() {
  const el = $('#view-home .ring-big[data-n]');
  if (!el || calm()) return;
  const n = +el.dataset.n, t0 = performance.now();
  const step = now => {
    const p = Math.min((now - t0) / 750, 1);
    el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = 0;
  requestAnimationFrame(step);
}

const homeEl = $('#view-home');
homeEl.addEventListener('click', e => {
  const wd = e.target.closest('.week button, .mini .day');
  if (wd && !wd.disabled) return openEditor(wd.dataset.d);
  const b = e.target.closest('[data-act]'); if (!b) return;
  const k = iso(today());
  if (b.dataset.act === 'today') openEditor(k);
  if (b.dataset.act === 'start') { go('cal'); toast('Tippe auf den ersten Tag deiner letzten Periode'); }
  if (b.dataset.act === 'pill') { db.days[k] = { ...(db.days[k] || {}), pill: true }; save(); buzz(12); render(); toast('Erledigt', true); }
});

// Punkt am Ring ziehen: blättert durch die Tage des Zyklus
let scrub = null;
homeEl.addEventListener('pointerdown', e => {
  const hit = e.target.closest('.knob-hit'); if (!hit) return;
  const a = analyse(); if (!a.p.length) return;
  e.preventDefault();
  try { hit.setPointerCapture(e.pointerId); } catch {}
  const r = hit.ownerSVGElement.getBoundingClientRect();
  scrub = { a, cx: r.left + r.width / 2, cy: r.top + r.height / 2, idx: -1 };
  $('#view-home .ring').classList.add('scrubbing');
  buzz(8);
});
homeEl.addEventListener('pointermove', e => {
  if (!scrub) return;
  const { a } = scrub, n = a.cyc;
  let ang = Math.atan2(e.clientY - scrub.cy, e.clientX - scrub.cx) + Math.PI / 2;
  if (ang < 0) ang += 2 * Math.PI;
  const idx = Math.min(Math.floor(ang / (2 * Math.PI) * n), n - 1);
  if (idx === scrub.idx) return;
  scrub.idx = idx;
  buzz(3);
  const [x, y] = ringPos(idx, n);
  $('#view-home .knob-g').setAttribute('transform', `translate(${x} ${y})`);
  $('#view-home .ring-text').innerHTML = `<div class="ring-label">${fmt(addDays(a.last, idx), { weekday: 'short', day: 'numeric', month: 'short' })}</div>
    <div class="ring-big word">Tag ${idx + 1}</div><div class="ring-small">${phaseAt(idx, a)[1]}</div>`;
});
const endScrub = () => {
  if (!scrub) return;
  const moved = scrub.idx >= 0;
  scrub = null;
  if (moved) { try { localStorage.setItem(HINT, '1'); } catch {} }
  renderHome(analyse());
};
homeEl.addEventListener('pointerup', endScrub);
homeEl.addEventListener('pointercancel', endScrub);

/* ---------- Ansicht: Kalender ---------- */
const monthName = d => d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const WDS = '<div class="wds">' + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<div class="wd">${w}</div>`).join('') + '</div>';

function renderCal(a) {
  const second = new Date(month.getFullYear(), month.getMonth() + 1, 1); // nur am PC sichtbar
  $('#month').textContent = monthName(month);
  $('#cal').innerHTML = calGrid(a, month);
  $('#month2').textContent = monthName(second);
  $('#cal2').innerHTML = calGrid(a, second);
  // "Heute"-Knopf nur zeigen, wenn ein anderer Monat offen ist
  const t = today();
  $('#cal-today').hidden = month.getFullYear() === t.getFullYear() && month.getMonth() === t.getMonth();
}

// Tage eines Monats als Raster (für den Kalender und das Monatsfeld auf der Startseite)
function calGrid(a, mon) {
  const t = today(), y = mon.getFullYear(), m = mon.getMonth();
  const first = (mon.getDay() + 6) % 7;
  const n = new Date(y, m + 1, 0).getDate();
  const info = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(y, m, i), k = iso(d), st = dayState(k, d, a, t);
    // Gruppe für durchgehende Bänder: Periode, erwartet, fruchtbar
    const g = /^f\d$/.test(st) ? 'p' : st === 'pred' ? 'e' : st === 'fert' || st === 'ovu' ? 'f' : '';
    info.push({ d, k, st, g, col: (first + i - 1) % 7 });
  }
  let html = '<div></div>'.repeat(first);
  const NAMES = { p: 'Periode', e: 'Erwartet', f: 'Fruchtbar' };
  info.forEach((x, i) => {
    const e = db.days[x.k], cls = ['day'], isToday = +x.d === +t;
    if (x.st) cls.push(x.st);
    let label = '', what = '';
    if (x.g) {
      const jl = x.col > 0 && info[i - 1]?.g === x.g, jr = x.col < 6 && info[i + 1]?.g === x.g;
      cls.push('g-' + x.g);
      if (jl) cls.push('jl');
      if (jr) cls.push('jr');
      what = x.g === 'p' ? 'Periode' : x.g === 'e' ? 'Periode erwartet' : x.st === 'ovu' ? 'Eisprung (geschätzt)' : 'Fruchtbare Tage';
      // Beschriftung direkt im Kalender: am Anfang jedes Bandes, beim Eisprung immer
      if (x.st === 'ovu') label = 'Eisprung';
      else if (!jl) label = NAMES[x.g];
    }
    if (x.st === 'spot') what = 'Schmierblutung';
    if (isToday) { cls.push('today'); if (!label) label = 'Heute'; }
    if (e && (e.mood || e.energy || e.symptoms || e.note || e.pill)) cls.push('has');
    const tip = fmt(x.d, { weekday: 'long', day: 'numeric', month: 'long' }) + (isToday ? ' · Heute' : '') + (what ? ' · ' + what : '');
    html += `<button class="${cls.join(' ')}" data-d="${x.k}" ${x.d > t ? 'disabled' : ''} title="${tip}" aria-label="${tip}"><span class="n">${i + 1}</span>${label ? `<small class="lb">${label}</small>` : ''}</button>`;
  });
  return html;
}

function shiftMonth(dir) {
  month = new Date(month.getFullYear(), month.getMonth() + dir, 1);
  render();
  document.querySelectorAll('#cal,#cal2').forEach(cal => {
    cal.classList.remove('sl', 'sr');
    replay(cal, dir > 0 ? 'sl' : 'sr');
  });
  buzz(5);
}
const calEl = $('#cal');
document.querySelectorAll('#cal,#cal2').forEach(cal =>
  cal.addEventListener('click', e => { const b = e.target.closest('.day'); if (b && !b.disabled) openEditor(b.dataset.d); }));
$('#cal-today').onclick = () => { const t = today(), back = month > t; month = new Date(t.getFullYear(), t.getMonth() + (back ? 1 : -1), 1); shiftMonth(back ? -1 : 1); };
$('#prev').onclick = () => shiftMonth(-1);
$('#next').onclick = $('#next2').onclick = () => shiftMonth(1);
// Tastenkürzel (am PC)
document.addEventListener('keydown', e => {
  if (lock.mode || !$('#lock').hidden) return;
  if (sheet.open) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('#sheet-save').click(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === '1') go('home');
  else if (k === '2') go('cal');
  else if (k === '3') go('more');
  else if (k === 'e') { e.preventDefault(); openEditor(iso(today())); }
  else if (view === 'cal' && k === 'arrowleft') shiftMonth(-1);
  else if (view === 'cal' && k === 'arrowright') shiftMonth(1);
});
// Wischen wechselt den Monat
let swipe = null;
calEl.addEventListener('touchstart', e => { const p = e.touches[0]; swipe = { x: p.clientX, y: p.clientY }; }, { passive: true });
calEl.addEventListener('touchend', e => {
  if (!swipe) return;
  const p = e.changedTouches[0], dx = p.clientX - swipe.x, dy = p.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) shiftMonth(dx < 0 ? 1 : -1);
}, { passive: true });

/* ---------- Eintrag bearbeiten ---------- */
const sheet = $('#sheet');
let draft = null, draftKey = null;

function openEditor(k) {
  draftKey = k;
  draft = JSON.parse(JSON.stringify(db.days[k] || {}));
  draft.symptoms = draft.symptoms || [];
  // Schmierblutung ('s') ist eine eigene Auswahl und zählt nicht als Periode
  const flowTiles = [[0, 'Keine', drops(0)], ['s', 'Schmier', `<span class="drops spot">${DROP}</span>`], [1, 'Leicht', drops(1)], [2, 'Mittel', drops(2)], [3, 'Stark', drops(3)]];
  const flowOn = v => v === 's' ? !!draft.spot : !draft.spot && (draft.flow || 0) === v;
  $('#sheet-body').innerHTML = `
    <h2>${fmt(parse(k), { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <h3>Blutung</h3>
    <div class="seg flow">${flowTiles.map(([v, l, icon]) => `<button type="button" data-flow="${v}" class="${flowOn(v) ? 'on' : ''}">${icon}<small>${l}</small></button>`).join('')}</div>
    <p class="hint">Eine Schmierblutung zählt nicht als Periode und verschiebt die Vorhersage nicht.</p>
    <h3>Stimmung</h3>
    <div class="seg wrap">${MOODS.map(([em, l]) => `<button type="button" data-mood="${l}" class="${draft.mood === l ? 'on' : ''}">${em}<small>${l}</small></button>`).join('')}</div>
    <h3>Energie</h3>
    <div class="seg">${ENERGY.map((l, i) => `<button type="button" data-energy="${l}" class="${draft.energy === l ? 'on' : ''}">${level(i + 1)}<small>${l}</small></button>`).join('')}</div>
    <h3>Symptome</h3>
    <div class="chips">${SYMPTOMS.map(s => `<button type="button" data-sym="${s}" class="chip ${draft.symptoms.includes(s) ? 'on' : ''}">${s}</button>`).join('')}</div>
    ${db.settings.pill ? `<label class="check"><span>${ic('pill')}Pille genommen</span><input type="checkbox" class="switch" id="pill" ${draft.pill ? 'checked' : ''}></label>` : ''}
    <h3>Notiz</h3>
    <textarea id="note" rows="3" placeholder="Wie geht's dir heute?">${esc(draft.note || '')}</textarea>`;
  sheet.classList.remove('closing');
  sheet.style.transform = sheet.style.transition = '';
  sheet.showModal();
  $('#sheet-body').scrollTop = 0;
  buzz(6);
}

// Sheet mit Animation schließen
function closeSheet() {
  if (!sheet.open || sheet.classList.contains('closing')) return;
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    sheet.classList.remove('closing');
    sheet.style.transform = sheet.style.transition = '';
    if (sheet.open) sheet.close();
  };
  sheet.classList.add('closing');
  sheet.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, calm() ? 0 : 340);
}

function pickOne(btn, on) {
  btn.parentNode.querySelectorAll('button').forEach(x => x.classList.remove('on'));
  if (on) { btn.classList.add('on'); replay(btn, 'pop'); }
}

$('#sheet-body').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  buzz(5);
  if (d.flow !== undefined) {
    draft.spot = d.flow === 's';
    draft.flow = draft.spot ? 0 : +d.flow;
    pickOne(b, true);
  }
  else if (d.mood) { draft.mood = draft.mood === d.mood ? null : d.mood; pickOne(b, !!draft.mood); }
  else if (d.energy) { draft.energy = draft.energy === d.energy ? null : d.energy; pickOne(b, !!draft.energy); }
  else if (d.sym) {
    const i = draft.symptoms.indexOf(d.sym);
    i >= 0 ? draft.symptoms.splice(i, 1) : draft.symptoms.push(d.sym);
    b.classList.toggle('on', i < 0);
    if (i < 0) replay(b, 'pop');
  }
});

$('#sheet-save').onclick = () => {
  const note = $('#note').value.trim();
  const pill = $('#pill');
  const clean = {};
  if (draft.flow) clean.flow = draft.flow;
  else if (draft.spot) clean.spot = true;
  if (draft.mood) clean.mood = draft.mood;
  if (draft.energy) clean.energy = draft.energy;
  if (draft.symptoms.length) clean.symptoms = draft.symptoms;
  if (pill ? pill.checked : draft.pill) clean.pill = true;
  if (note) clean.note = note;
  if (Object.keys(clean).length) db.days[draftKey] = clean; else delete db.days[draftKey];
  save();
  buzz([10, 50, 16]);
  closeSheet();
  render();
  toast('Gespeichert', true);
};
$('#sheet-cancel').onclick = closeSheet;
sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });   // Zurück-Taste
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); }); // Tippen neben das Sheet

// Sheet am Griff nach unten wegziehen
const grab = $('.sheet-grab');
let drag = null;
grab.addEventListener('pointerdown', e => {
  drag = { y: e.clientY, dy: 0, t: performance.now() };
  try { grab.setPointerCapture(e.pointerId); } catch {}
  sheet.style.transition = 'none';
});
grab.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.dy = Math.max(0, e.clientY - drag.y);
  sheet.style.transform = `translateY(${drag.dy}px)`;
});
const endDrag = () => {
  if (!drag) return;
  const { dy, t } = drag;
  drag = null;
  const speed = dy / Math.max(performance.now() - t, 1);
  if (dy > 120 || (dy > 40 && speed > 0.6)) return closeSheet();
  sheet.style.transition = 'transform .4s cubic-bezier(.3,1.35,.5,1)';
  sheet.style.transform = '';
};
grab.addEventListener('pointerup', endDrag);
grab.addEventListener('pointercancel', endDrag);

/* ---------- Ansicht: Übersicht ---------- */
function renderMore(a) {
  const hist = a.p.map((x, i) => ({ ...x, len: a.p[i + 1] ? diff(x.start, a.p[i + 1].start) : null })).slice(-6).reverse()
    .map(x => `<li><b>${fmt(x.start, { day: 'numeric', month: 'short' })} – ${fmt(x.end, { day: 'numeric', month: 'short' })}</b>
      <span>${plural(diff(x.start, x.end) + 1, 'Tag', 'Tage')}${x.len ? ` · Zyklus ${x.len} Tage` : ' · zuletzt'}</span></li>`).join('');

  // Balken: die letzten Zyklen. Nicht mitgerechnete (auffällig lange) sind blass dargestellt.
  const last = a.recent, lens = last.filter(c => !c.out).map(c => c.len);
  const mn = Math.min(...lens), mx = Math.max(...lens), top2 = Math.max(...last.map(c => c.len));
  const bars = last.length >= 2 ? last.map(c =>
    `<div class="bar ${c.out ? 'out' : ''}"><b>${c.len}</b><i style="height:${Math.round(c.len / top2 * 78)}px"></i><span>${fmt(c.start, { month: 'short' }).replace('.', '')}</span></div>`).join('') : '';
  const info = [];
  if (a.regular) info.push(`${a.regular}: deine Zyklen schwanken um etwa ± ${plural(a.pm, 'Tag', 'Tage')}.`);
  else if (a.known) info.push('Ab drei erfassten Zyklen zeige ich, wie regelmäßig dein Zyklus ist.');
  else info.push('Noch keine zwei Perioden eingetragen. Bis dahin rechne ich mit 28 Tagen.');
  if (a.outliers) info.push(`${a.outliers === 1 ? 'Ein auffällig langer Zyklus wird' : a.outliers + ' auffällig lange Zyklen werden'} nicht mitgerechnet. Vermutlich fehlt dort ein Eintrag.`);

  const count = {};
  Object.values(db.days).forEach(e => (e.symptoms || []).forEach(s => { count[s] = (count[s] || 0) + 1; }));
  const top = Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 3);

  const s = db.settings;
  $('#view-more').innerHTML = `
    <div class="col">
    <div class="glass card">
      <h2>Dein Zyklus</h2>
      <div class="stats">
        <div class="stat"><b>${a.cyc}<small>Tage</small></b><span>Typische Zykluslänge</span></div>
        <div class="stat"><b>${a.dur}<small>Tage</small></b><span>Typische Periodendauer</span></div>
        <div class="stat"><b>${a.known}</b><span>Erfasste Zyklen</span></div>
        <div class="stat"><b>${lens.length ? `${mn}–${mx}` : '–'}</b><span>Kürzester – längster</span></div>
      </div>
      <p class="foot">${info.join(' ')}</p>
    </div>
    ${bars ? `<div class="glass card"><h2>Zykluslängen</h2><div class="bars">${bars}</div></div>` : ''}
    ${top.length ? `<div class="glass card"><h2>Häufigste Symptome</h2><div class="summary" style="margin:0">${top.map(([n, c]) => `<span class="tag">${esc(n)} · ${c}×</span>`).join('')}</div></div>` : ''}
    </div>
    <div class="col">
    ${hist ? `<div class="glass card"><h2>Letzte Perioden</h2><ul class="hist">${hist}</ul></div>` : ''}
    <div class="glass card">
      <h2>Einstellungen</h2>
      <label class="setting"><i class="si">${ic('pill')}</i><span class="st">Pille tracken<small>Tägliche Erinnerung in der App</small></span>
        <input type="checkbox" class="switch" id="set-pill" ${s.pill ? 'checked' : ''}></label>
      <div class="setting"><i class="si">${ic('lock')}</i><span class="st">PIN-Sperre<small>${s.pinHash ? 'Aktiv' : 'Aus'}</small></span>
        <div class="btn-row">${s.pinHash
          ? '<button class="small-btn" data-act="pin-set">Ändern</button><button class="small-btn" data-act="pin-off">Aus</button>'
          : '<button class="small-btn" data-act="pin-set">Einrichten</button>'}</div></div>
      <div class="setting"><i class="si">${ic('save')}</i><span class="st">Sicherung<small>Daten als Datei</small></span>
        <div class="btn-row"><button class="small-btn" data-act="export">Sichern</button>
        <label class="small-btn">Laden<input type="file" id="import" accept=".json,application/json" hidden></label></div></div>
    </div>
    <div class="glass card pc-only">
      <h2>Tastenkürzel</h2>
      <ul class="keys">
        <li><span>Heute, Kalender, Übersicht</span><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span></li>
        <li><span>Heute eintragen</span><kbd>E</kbd></li>
        <li><span>Monat wechseln (im Kalender)</span><span><kbd>←</kbd> <kbd>→</kbd></span></li>
        <li><span>Eintrag speichern</span><span><kbd>Strg</kbd> <kbd>Enter</kbd></span></li>
        <li><span>Fenster schließen</span><kbd>Esc</kbd></li>
      </ul>
    </div>
    </div>
    <p class="note">Alle Daten bleiben nur auf diesem Gerät. Vorhersagen sind Schätzungen, kein Verhütungsmittel und kein Ersatz für ärztlichen Rat.</p>`;
}

$('#view-more').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'pin-set') showLock('set1');
  if (act === 'pin-off' && confirm('PIN-Sperre ausschalten?')) { db.settings.pinHash = db.settings.pinSalt = null; save(); render(); toast('PIN entfernt'); }
  if (act === 'export') exportData();
});
$('#view-more').addEventListener('change', async e => {
  if (e.target.id === 'set-pill') { db.settings.pill = e.target.checked; save(); buzz(8); }
  if (e.target.id === 'import') { await importData(e.target.files[0]); e.target.value = ''; }
});

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'ente', days: db.days, pill: db.settings.pill })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ente-sicherung-${iso(today())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    let days;
    if (Array.isArray(data)) days = Object.fromEntries(data.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).map(s => [s, { flow: 2 }]));
    else if (data && typeof data.days === 'object') days = data.days;
    else throw 0;
    if (!confirm(`${Object.keys(days).length} Einträge laden? Die aktuellen Daten werden ersetzt.`)) return;
    db.days = days;
    if (typeof data.pill === 'boolean') db.settings.pill = data.pill;
    save(); render(); toast('Wiederhergestellt', true);
  } catch { alert('Diese Datei konnte nicht gelesen werden.'); }
}

/* ---------- PIN-Sperre ---------- */
const lock = { mode: null, buf: '', first: '' };

function randomSalt() { return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const b of data) h = ((h * 33) ^ b) >>> 0; return 'x' + h;
}

(function buildPad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'alt', '0', 'del'];
  $('#pad').innerHTML = keys.map(k => k === 'alt' ? '<button class="txt" data-k="alt" id="lock-alt"></button>'
    : k === 'del' ? `<button class="txt" data-k="del" aria-label="Löschen">${ic('back')}</button>`
    : `<button class="glass" data-k="${k}">${k}</button>`).join('');
  $('#pad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { buzz(6); pinKey(b.dataset.k); } });
  document.addEventListener('keydown', e => {
    if (!lock.mode) return;
    if (/^\d$/.test(e.key)) pinKey(e.key);
    else if (e.key === 'Backspace') pinKey('del');
  });
})();

function showLock(mode, msg = '') {
  lock.mode = mode; lock.buf = '';
  if (sheet.open) sheet.close();
  $('#lock').hidden = false;
  document.body.classList.add('locked');
  renderLock(msg);
  glassSoon();
}
function hideLock() {
  lock.mode = null;
  $('#lock').hidden = true;
  document.body.classList.remove('locked');
}
function renderLock(msg = '') {
  const titles = { unlock: `Hallo ${CONFIG.spitzname}`, set1: 'Neue PIN wählen', set2: 'PIN nochmal eingeben' };
  $('#lock-title').textContent = titles[lock.mode];
  $('#dots').innerHTML = [0, 1, 2, 3].map(i => `<span class="${i < lock.buf.length ? 'on' : ''}"></span>`).join('');
  $('#lock-msg').textContent = msg;
  $('#lock-alt').textContent = lock.mode === 'unlock' ? 'Vergessen?' : 'Abbrechen';
}
function wrong(msg) { setTimeout(() => { renderLock(msg); replay($('#dots'), 'shake'); buzz([30, 60, 30]); }, 200); }

async function pinKey(k) {
  if (k === 'del') { lock.buf = lock.buf.slice(0, -1); return renderLock(); }
  if (k === 'alt') return lock.mode === 'unlock' ? forgotPin() : hideLock();
  if (lock.buf.length >= 4) return;
  lock.buf += k; renderLock();
  if (lock.buf.length < 4) return;

  const pin = lock.buf;
  if (lock.mode === 'unlock') {
    if (await hashPin(pin, db.settings.pinSalt) === db.settings.pinHash) { hideLock(); go(view); }
    else { lock.buf = ''; wrong('Falsche PIN'); }
  } else if (lock.mode === 'set1') {
    lock.first = pin; lock.mode = 'set2'; lock.buf = '';
    setTimeout(() => renderLock(), 150);
  } else if (pin === lock.first) {
    db.settings.pinSalt = randomSalt();
    db.settings.pinHash = await hashPin(pin, db.settings.pinSalt);
    save(); hideLock(); render(); toast('PIN gespeichert', true);
  } else {
    lock.mode = 'set1'; lock.buf = '';
    wrong('Stimmt nicht überein, nochmal');
  }
}

function forgotPin() {
  if (!confirm('PIN vergessen? Dann geht es nur weiter, wenn ALLE Daten gelöscht werden.')) return;
  if (!confirm('Wirklich alles löschen? Das kann nicht rückgängig gemacht werden.')) return;
  try { localStorage.removeItem(STORE); } catch {}
  location.reload();
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (db.settings.pinHash && !lock.mode && Date.now() - hiddenAt > 60000) showLock('unlock');
  if (!sheet.open && !scrub) render();
});

/* ---------- Allgemein ---------- */
let toastTimer;
function toast(text, ok = false) {
  const t = $('#toast');
  t.innerHTML = (ok ? ic('check') : '') + `<span>${esc(text)}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function render() {
  const a = analyse(), t = today();
  const h = new Date().getHours();
  const hi = `${h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend'}, ${CONFIG.spitzname}`;
  $('#hello').textContent = view === 'home' ? fmt(t, { weekday: 'long', day: 'numeric', month: 'long' }) : hi;
  $('#title').textContent = view === 'home' ? hi : TITLES[view];
  // Hintergrundfarben folgen der Zyklusphase
  const ph = phaseToday(a);
  document.documentElement.dataset.phase = ph ? ph[0] : 'none';
  VIEWS.forEach(v => { $('#view-' + v).hidden = v !== view; });
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('.tabs').style.setProperty('--i', VIEWS.indexOf(view));
  if (view === 'home') renderHome(a);
  else if (view === 'cal') renderCal(a);
  else renderMore(a);
  glassSoon();
}

// Ansicht wechseln: Karten gleiten herein, die Glaslinse dehnt sich
let inTimer;
function go(v) {
  const changed = v !== view;
  view = v;
  render();
  const el = $('#view-' + v);
  replay(el, 'in');
  clearTimeout(inTimer);
  inTimer = setTimeout(() => el.classList.remove('in'), 1600);
  if (v === 'home') countUp();
  if (changed) replay($('.tabs .lens'), 'mv');
  scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { buzz(6); go(b.dataset.view); });

// Lichtkante am Glas folgt der Neigung des Handys
if ('DeviceOrientationEvent' in window) {
  let raf = 0, last = 140;
  addEventListener('deviceorientation', e => {
    if (e.gamma == null || raf) return;
    const ang = Math.round(140 + Math.max(-55, Math.min(55, e.gamma * 1.4)));
    if (Math.abs(ang - last) < 2) return;
    raf = requestAnimationFrame(() => { raf = 0; last = ang; document.documentElement.style.setProperty('--la', ang + 'deg'); });
  });
}

/* ---------- Echtes Liquid Glass (PC, Chrome/Edge) ----------
   Jede Glasfläche bekommt einen SVG-Filter, der das Bild dahinter am Rand
   verbiegt wie eine Linse. Dafür wird pro Flächengröße eine "Verschiebungskarte"
   berechnet: Rot = Verschiebung in x, Grün = Verschiebung in y, 128 = keine.
   Handys und andere Browser behalten das einfache Milchglas. */
const LG = { on: false, lite: false, n: 0, cache: new Map(), defs: $('#lg defs') };
const pcMq = matchMedia('(min-width:900px) and (hover:hover) and (pointer:fine)');
const isChromium = /Chrome\//.test(navigator.userAgent) && !/Firefox|OPR\/.*Mini/.test(navigator.userAgent);

function lgMap(w, h, r, bezel) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const hx = w / 2, hy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx, py = y + 0.5 - hy;
      const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
      let dist, nx = 0, ny = 0; // Abstand zum Rand (nach innen) und Richtung nach außen
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; dist = r - l; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
      else if (qx > qy) { dist = r - qx; nx = Math.sign(px); }
      else { dist = r - qy; ny = Math.sign(py); }
      let m = 0;
      if (dist < bezel) { const t = 1 - Math.max(dist, 0) / bezel; m = 1 - Math.sqrt(1 - t * t); } // gewölbter Rand
      const i = (y * w + x) * 4;
      d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function lgFilter(w, h, r, fine = false) {
  const key = `${w}x${h}x${r}x${fine}`;
  let id = LG.cache.get(key);
  if (id) return id;
  if (LG.cache.size > 48) { LG.cache.clear(); LG.defs.innerHTML = ''; document.querySelectorAll('[data-lgf]').forEach(el => delete el.dataset.lgf); }
  id = 'lg' + (++LG.n);
  const bezel = Math.max(6, Math.min(r, 30, w / 2, h / 2));
  const s = bezel * 1.9; // Stärke der Brechung
  // "fine" (nur kleine Flächen): Rot, Grün und Blau werden leicht unterschiedlich gebrochen,
  // das gibt den feinen Farbsaum von echtem Glas. Kostet dreifache Rechenzeit, deshalb nicht für große Karten.
  const ch = (scale, vals, out) => `<feDisplacementMap in="SourceGraphic" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/><feColorMatrix type="matrix" values="${vals}" result="${out}"/>`;
  const body = fine
    ? `${ch(s * 1.14, '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0', 'r')}
       ${ch(s, '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0', 'g')}
       ${ch(s * 0.86, '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0', 'b')}
       <feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`
    : `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G"/>`;
  LG.defs.insertAdjacentHTML('beforeend', `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">
    <feImage href="${lgMap(w, h, r, bezel)}" x="0" y="0" width="${w}" height="${h}" result="m"/>${body}
  </filter>`);
  LG.cache.set(key, id);
  return id;
}

function applyGlass() {
  if (!LG.on) return;
  document.querySelectorAll('.glass,.tabs').forEach(el => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    const r = Math.round(Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2));
    const small = w * h < 40000; // Seitenleiste, Avatar, PIN-Tasten: mit Farbsaum
    const tail = el.classList.contains('tabs') ? 'blur(3px) saturate(1.9)' : el.classList.contains('frost') ? 'blur(20px) saturate(1.5)' : 'blur(7px) saturate(1.7)';
    const f = `url(#${lgFilter(w, h, r, small)}) ${tail}`;
    if (el.dataset.lgf === f) return;
    el.dataset.lgf = f;
    el.style.backdropFilter = f;
  });
}
let glassRaf = 0;
function glassSoon() { if (LG.on && !glassRaf) glassRaf = requestAnimationFrame(() => { glassRaf = 0; applyGlass(); }); }

function setLiquid() {
  const want = isChromium && pcMq.matches && !LG.lite;
  if (want === LG.on) return;
  LG.on = want;
  document.documentElement.classList.toggle('lg', want);
  if (want) applyGlass();
  else document.querySelectorAll('[data-lgf]').forEach(el => { el.style.backdropFilter = ''; delete el.dataset.lgf; });
}
pcMq.addEventListener('change', setLiquid);
let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyGlass, 140); });

// Maus: Lichtfleck auf der Glasfläche unter dem Zeiger, Hintergrundkugeln bewegen sich leicht mit
{
  const bg = $('.bg');
  let raf = 0, ev = null, lastT = 0, slow = 0, seen = 0;
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    ev = e;
    if (raf) return;
    raf = requestAnimationFrame(now => {
      raf = 0;
      const g = ev.target.closest?.('.glass');
      if (g) {
        const b = g.getBoundingClientRect();
        g.style.setProperty('--mx', (ev.clientX - b.left) + 'px');
        g.style.setProperty('--my', (ev.clientY - b.top) + 'px');
      }
      if (LG.lite || calm()) return;
      bg.style.setProperty('--px', (ev.clientX / innerWidth * 2 - 1).toFixed(3));
      bg.style.setProperty('--py', (ev.clientY / innerHeight * 2 - 1).toFixed(3));
      // Schutz für langsame Rechner: ruckelt es dauerhaft, zurück zum einfachen Glas
      if (LG.on && lastT && now - lastT < 120) {
        seen++; if (now - lastT > 40) slow++;
        if (seen >= 90) {
          if (slow > 45) { LG.lite = true; document.documentElement.classList.add('lite'); setLiquid(); }
          seen = slow = 0;
        }
      }
      lastT = now;
    });
  }, { passive: true });
}

// Die App soll immer oben starten, nicht an der letzten Scroll-Position
try { history.scrollRestoration = 'manual'; } catch {}

setLiquid();
if (db.settings.pinHash) { showLock('unlock'); render(); }
else go('home');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

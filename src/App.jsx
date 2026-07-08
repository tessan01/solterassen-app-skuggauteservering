import React, { useState, useMemo, useEffect, useRef } from "react";

/* ---------------- Solar position (real astronomy, SunCalc-style) ---------------- */
const RAD = Math.PI / 180;
const DAY_MS = 86400000, J1970 = 2440588, J2000 = 2451545;
const OBL = RAD * 23.4397;

const toDays = (date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
function sunPosition(date, lat, lng) {
  const lw = RAD * -lng, phi = RAD * lat, d = toDays(date);
  const M = RAD * (357.5291 + 0.98560028 * d);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBL) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBL), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
  const azimuth = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD + 180 + 360) % 360;
  return { altitude, azimuth };
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/* ---------------- Venues (demo data, approximate positions & facings) ---------------- */
const GBG = { lat: 57.7035, lng: 11.96 };
const V = (id, name, area, lat, lng, aspect, open, minAlt, roof) =>
  ({ id, name, area, lat, lng, aspect, open, minAlt, roof: !!roof });

const BASE_VENUES = [
  V(1, "Rosenkaféet", "Trädgårdsföreningen", 57.7052, 11.974, 190, 110, 6),
  V(2, "Norda Terrace", "Drottningtorget", 57.7086, 11.9736, 225, 80, 12),
  V(3, "Brasserie Lipp", "Kungsportsavenyn", 57.6989, 11.977, 135, 75, 14),
  V(4, "Bellora Rooftop", "Avenyn", 57.7003, 11.9752, 180, 178, 5, true),
  V(5, "Yaki-Da Roof", "Storgatan", 57.6995, 11.9718, 200, 160, 7, true),
  V(6, "Café Husaren", "Haga Nygata", 57.6989, 11.9611, 175, 55, 20),
  V(7, "Publik", "Andra Långgatan", 57.6996, 11.9503, 185, 60, 16),
  V(8, "Tranquilo", "Långgatorna", 57.699, 11.9535, 165, 65, 15),
  V(9, "The Old Beefeater Inn", "Linné", 57.6944, 11.9497, 250, 80, 12),
  V(10, "Kajskjul 8", "Packhuskajen", 57.7107, 11.9615, 290, 120, 4),
  V(11, "Sjömagasinet", "Klippan", 57.6907, 11.911, 315, 120, 4),
  V(12, "Steamers", "Lindholmen quay", 57.7069, 11.9391, 185, 130, 4),
  V(13, "Familjen", "Arkivgatan", 57.6976, 11.9803, 220, 75, 13),
  V(14, "Toso", "Avenyn", 57.7, 11.9767, 315, 70, 14),
  V(15, "Taverna Averna", "Tredje Långgatan", 57.6986, 11.9525, 175, 60, 16),
  V(16, "Bar Centro", "Kyrkogatan", 57.7048, 11.9645, 180, 50, 22),
  V(17, "Da Matteo", "Magasinsgatan", 57.7035, 11.964, 190, 70, 15),
  V(18, "Kafé Magasinet", "Tredje Långgatan", 57.6989, 11.9518, 180, 140, 10, true),
  V(19, "Pustervik", "Järntorgsgatan", 57.6994, 11.9557, 240, 85, 12),
  V(20, "Röda Sten Kafé", "Röda Sten", 57.6889, 11.9017, 270, 130, 4),
  V(21, "Wine Mechanics", "Frihamnen", 57.7146, 11.9524, 200, 130, 5),
  V(22, "Solrosen", "Kaponjärgatan", 57.6975, 11.9585, 170, 60, 17),
  V(23, "Le Pain Français", "Avenyn", 57.7008, 11.9748, 135, 75, 14),
  V(24, "Barabicu", "Kungstorget", 57.7033, 11.9679, 210, 95, 10),
  V(25, "Hello Monkey", "Magasinsgatan", 57.7031, 11.9635, 185, 70, 15),
];

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const dirLabel = (deg) => DIRS[Math.round((deg % 360) / 45) % 8];
const dirToDeg = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const quadrant = (deg) => ["N", "E", "S", "W"][Math.round((deg % 360) / 90) % 4];

/* ---------------- Time helpers ---------------- */
const START_MIN = 4 * 60, END_MIN = 23 * 60, STEP = 15;
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dateAt = (dateStr, minutes) => { const d = new Date(`${dateStr}T00:00:00`); d.setMinutes(minutes); return d; };
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const weekday = (dateStr) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${dateStr}T12:00:00`).getDay()];
const isSunny = (v, pos) => pos.altitude > v.minAlt && angDiff(pos.azimuth, v.aspect) <= v.open;
const dayHours = (v, dateStr) => {
  let n = 0;
  for (let m = START_MIN; m <= END_MIN; m += STEP) if (isSunny(v, sunPosition(dateAt(dateStr, m), v.lat, v.lng))) n++;
  return (n * STEP) / 60;
};

/* ---------------- Component ---------------- */
export default function App() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowMin = Math.min(END_MIN, Math.max(START_MIN, now.getHours() * 60 + now.getMinutes()));

  const [dateStr, setDateStr] = useState(todayStr);
  const [minutes, setMinutes] = useState(nowMin);
  const [dirFilter, setDirFilter] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [custom, setCustom] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [draft, setDraft] = useState(null);
  const [cloudy, setCloudy] = useState(false);
  const [rankMode, setRankMode] = useState("now"); // "now" | "today"
  const [leafletReady, setLeafletReady] = useState(false);

  const mapEl = useRef(null), mapRef = useRef(null), layerRef = useRef(null), draftMarkerRef = useRef(null);
  const addModeRef = useRef(false); addModeRef.current = addMode;

  const venues = useMemo(() => [...BASE_VENUES, ...custom], [custom]);
  const visible = venues.filter((v) => dirFilter.length === 0 || dirFilter.includes(quadrant(v.aspect)));

  /* Day profiles */
  const profiles = useMemo(() => {
    const map = {};
    for (const v of venues) {
      const steps = [];
      for (let m = START_MIN; m <= END_MIN; m += STEP)
        steps.push(isSunny(v, sunPosition(dateAt(dateStr, m), v.lat, v.lng)));
      const first = steps.indexOf(true), last = steps.lastIndexOf(true);
      map[v.id] = {
        steps,
        hours: (steps.filter(Boolean).length * STEP) / 60,
        window: first === -1 ? null : [START_MIN + first * STEP, START_MIN + last * STEP],
      };
    }
    return map;
  }, [venues, dateStr]);

  /* Sun curve + golden hour bands */
  const curve = useMemo(() => {
    const pts = [];
    for (let m = START_MIN; m <= END_MIN; m += 20)
      pts.push([m, sunPosition(dateAt(dateStr, m), GBG.lat, GBG.lng).altitude]);
    return pts;
  }, [dateStr]);

  const goldenBands = useMemo(() => {
    const bands = []; let start = null;
    for (let m = START_MIN; m <= END_MIN; m += 10) {
      const alt = sunPosition(dateAt(dateStr, m), GBG.lat, GBG.lng).altitude;
      const inGold = alt > 0 && alt < 7;
      if (inGold && start === null) start = m;
      if (!inGold && start !== null) { bands.push([start, m]); start = null; }
    }
    if (start !== null) bands.push([start, END_MIN]);
    return bands;
  }, [dateStr]);

  const sunNowPos = sunPosition(dateAt(dateStr, minutes), GBG.lat, GBG.lng);
  const sunnyNowIds = useMemo(() => {
    const s = new Set();
    for (const v of visible) if (isSunny(v, sunPosition(dateAt(dateStr, minutes), v.lat, v.lng))) s.add(v.id);
    return s;
  }, [visible, dateStr, minutes]);

  const selected = venues.find((v) => v.id === selectedId);
  const selProfile = selected ? profiles[selected.id] : null;

  /* Shade warning / sun arriving */
  const transition = useMemo(() => {
    if (!selected || !selProfile) return null;
    const idx = Math.round((minutes - START_MIN) / STEP);
    const steps = selProfile.steps;
    if (idx < 0 || idx >= steps.length) return null;
    if (steps[idx]) {
      let j = idx; while (j < steps.length && steps[j]) j++;
      if (j < steps.length) {
        const end = START_MIN + j * STEP;
        if (end - minutes <= 60) return { type: "leaving", at: end };
      }
    } else {
      let j = idx; while (j < steps.length && !steps[j]) j++;
      if (j < steps.length) {
        const start = START_MIN + j * STEP;
        if (start - minutes <= 60) return { type: "arriving", at: start };
      }
    }
    return null;
  }, [selected, selProfile, minutes]);

  /* Weekly forecast for selected venue */
  const forecast = useMemo(() => {
    if (!selected) return null;
    return Array.from({ length: 7 }, (_, i) => {
      const ds = addDays(dateStr, i);
      return { ds, day: weekday(ds), hours: dayHours(selected, ds) };
    });
  }, [selected, dateStr]);

  /* Ranking */
  const ranking = useMemo(() => {
    const rows = visible.map((v) => {
      const p = profiles[v.id];
      const idx = Math.round((minutes - START_MIN) / STEP);
      let sunLeft = 0;
      if (p.steps[idx]) { let j = idx; while (j < p.steps.length && p.steps[j]) { sunLeft += STEP; j++; } }
      return { v, hours: p.hours, sunLeft, sunny: sunnyNowIds.has(v.id) };
    });
    if (rankMode === "now") {
      return rows.filter((r) => r.sunny).sort((a, b) => b.sunLeft - a.sunLeft).slice(0, 5);
    }
    return [...rows].sort((a, b) => b.hours - a.hours).slice(0, 5);
  }, [visible, profiles, minutes, sunnyNowIds, rankMode]);

  /* ---------------- Leaflet setup ---------------- */
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = () => setLeafletReady(true);
    document.head.appendChild(js);
  }, []);

  useEffect(() => {
    if (!leafletReady || mapRef.current || !mapEl.current) return;
    const L = window.L;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true })
      .setView([57.7025, 11.958], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "osm-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e) => {
      if (!addModeRef.current) return;
      setDraft({ lat: e.latlng.lat, lng: e.latlng.lng, name: "", dir: "S", roof: false });
      setAddMode(false);
    });
    mapRef.current = map;
  }, [leafletReady]);

  /* Markers */
  useEffect(() => {
    if (!leafletReady || !layerRef.current) return;
    const L = window.L;
    layerRef.current.clearLayers();
    for (const v of visible) {
      const sunny = sunnyNowIds.has(v.id);
      const sel = v.id === selectedId;
      const fav = favorites.includes(v.id);
      const cls = `pin ${sunny ? (cloudy ? "pin-cloud" : "pin-sun") : "pin-shade"} ${sel ? "pin-sel" : ""}`;
      const icon = L.divIcon({
        className: "",
        html: `<div class="${cls}">${fav ? '<span class="pin-fav">♥</span>' : ""}</div>`,
        iconSize: [sel ? 22 : 16, sel ? 22 : 16],
        iconAnchor: [sel ? 11 : 8, sel ? 11 : 8],
      });
      const m = L.marker([v.lat, v.lng], { icon }).addTo(layerRef.current);
      m.bindTooltip(v.name, { direction: "top", offset: [0, -10], className: "pin-tip" });
      m.on("click", () => setSelectedId((cur) => (cur === v.id ? null : v.id)));
    }
    if (draftMarkerRef.current) { draftMarkerRef.current.remove(); draftMarkerRef.current = null; }
    if (draft) {
      const icon = L.divIcon({ className: "", html: '<div class="pin pin-draft"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      draftMarkerRef.current = L.marker([draft.lat, draft.lng], { icon }).addTo(mapRef.current);
    }
  }, [leafletReady, visible, sunnyNowIds, selectedId, favorites, cloudy, draft]);

  const selectAndPan = (id) => {
    setSelectedId(id);
    const v = venues.find((x) => x.id === id);
    if (v && mapRef.current) mapRef.current.panTo([v.lat, v.lng]);
  };

  const toggleDir = (d) => setDirFilter((f) => (f.includes(d) ? f.filter((x) => x !== d) : [...f, d]));
  const toggleFav = (id) => setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const jumpToNow = () => {
    setDateStr(todayStr);
    const n = new Date();
    setMinutes(Math.min(END_MIN, Math.max(START_MIN, n.getHours() * 60 + n.getMinutes())));
  };
  const saveDraft = () => {
    if (!draft?.name.trim()) return;
    const id = Date.now();
    setCustom((c) => [...c, {
      id, name: draft.name.trim(), area: "My spot", lat: draft.lat, lng: draft.lng,
      aspect: dirToDeg[draft.dir], open: draft.roof ? 170 : 80, minAlt: draft.roof ? 5 : 12, roof: draft.roof, mine: true,
    }]);
    setDraft(null); setSelectedId(id);
  };

  /* Arc geometry */
  const arcX = (m) => 20 + ((m - START_MIN) / (END_MIN - START_MIN)) * 320;
  const arcY = (alt) => 76 - Math.max(-8, alt) * 1.1;
  const curvePath = curve.map(([m, a], i) => `${i ? "L" : "M"}${arcX(m).toFixed(1)},${arcY(a).toFixed(1)}`).join(" ");
  const maxForecast = forecast ? Math.max(1, ...forecast.map((f) => f.hours)) : 1;
  const sunColor = cloudy ? "#a7a3b4" : "#d489b6";

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
        :root{
          --ink:#232030; --paper:#f7f7fa; --card:#ffffff; --line:#eceaf2;
          --violet:#8b7fd4; --violet-soft:#edeaf8;
          --pink:#d489b6; --pink-soft:#f7e9f1;
          --blue:#9fbee4; --blue-soft:#e9f0f9;
          --gray:#8e8a9c; --gray-soft:#f0eff4;
        }
        *{box-sizing:border-box;}
        .app{font-family:'Inter',sans-serif;background:var(--paper);min-height:100vh;color:var(--ink);padding:22px 14px 48px;}
        .wrap{max-width:820px;margin:0 auto;}
        h1{font-family:'Outfit',sans-serif;font-weight:600;font-size:1.7rem;margin:0;letter-spacing:-.01em;}
        h1 span{color:var(--pink);}
        .sub{color:var(--gray);margin:3px 0 18px;font-size:.86rem;}
        .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:12px;
          box-shadow:0 1px 3px rgba(35,32,48,.04);}
        .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
        .between{justify-content:space-between;}
        .chip{border:1px solid var(--line);border-radius:999px;padding:6px 13px;font-family:'Inter';font-weight:600;
          font-size:.8rem;background:var(--card);color:var(--ink);cursor:pointer;transition:background .12s,border-color .12s;}
        .chip:hover{border-color:var(--violet);}
        .chip.on{background:var(--violet);border-color:var(--violet);color:#fff;}
        .chip.accent{background:var(--ink);border-color:var(--ink);color:#fff;}
        .chip.cloud.on{background:var(--gray);border-color:var(--gray);}
        input[type=date]{font-family:'Inter';font-weight:500;border:1px solid var(--line);border-radius:10px;
          padding:6px 10px;color:var(--ink);background:var(--card);font-size:.85rem;}
        input[type=range]{width:100%;accent-color:var(--pink);}
        .timebig{font-family:'Outfit';font-size:1.35rem;font-weight:600;min-width:66px;font-variant-numeric:tabular-nums;}
        .stat{font-size:.82rem;font-weight:500;color:var(--gray);}
        .stat b{color:var(--ink);font-weight:600;}
        .label{font-family:'Outfit';font-weight:600;font-size:.95rem;margin:0 6px 0 0;}
        .mapbox{border-radius:16px;overflow:hidden;border:1px solid var(--line);box-shadow:0 1px 3px rgba(35,32,48,.05);}
        #map{height:440px;width:100%;background:var(--gray-soft);}
        .osm-tiles{filter:saturate(.6) contrast(.92) brightness(1.05);}
        .pin{width:100%;height:100%;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(35,32,48,.35);position:relative;}
        .pin-sun{background:var(--pink);}
        .pin-cloud{background:#b3aec2;}
        .pin-shade{background:var(--blue);}
        .pin-sel{border-color:var(--ink);}
        .pin-draft{background:var(--violet);}
        .pin-fav{position:absolute;top:-13px;right:-9px;font-size:11px;color:var(--pink);}
        .pin-tip{font-family:'Inter';font-weight:600;font-size:.75rem;border-radius:8px;}
        @media (prefers-reduced-motion: no-preference){
          .pin-sun{animation:pp 2.6s ease-in-out infinite;}
          @keyframes pp{0%,100%{box-shadow:0 1px 4px rgba(35,32,48,.35);}50%{box-shadow:0 0 0 6px rgba(212,137,182,.25);}}
        }
        .detail h2{font-family:'Outfit';font-weight:600;margin:0;font-size:1.15rem;}
        .heart{background:none;border:none;font-size:1.25rem;cursor:pointer;line-height:1;}
        .bar{display:flex;height:16px;border-radius:8px;overflow:hidden;margin:10px 0 4px;background:var(--blue-soft);}
        .seg{flex:1;}
        .ticks{display:flex;justify-content:space-between;font-size:.68rem;color:var(--gray);font-weight:600;}
        .tag{display:inline-block;background:var(--gray-soft);border-radius:999px;padding:3px 10px;
          font-size:.73rem;font-weight:600;margin:0 6px 6px 0;color:var(--ink);}
        .tag.sun{background:var(--pink-soft);color:#a5567f;}
        .tag.warn{background:#fdeef4;color:#b04a7e;}
        .btn{border:none;border-radius:11px;padding:9px 16px;font-family:'Inter';font-weight:600;cursor:pointer;
          background:var(--ink);color:#fff;font-size:.85rem;}
        .btn.ghost{background:var(--gray-soft);color:var(--ink);}
        .field{border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-family:'Inter';
          font-weight:500;width:100%;margin:6px 0;font-size:.88rem;}
        select.field{width:auto;}
        .note{font-size:.75rem;color:var(--gray);}
        .rank-row{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--line);cursor:pointer;}
        .rank-row:last-child{border-bottom:none;}
        .rank-row:hover{background:var(--paper);}
        .rank-num{font-family:'Outfit';font-weight:600;color:var(--gray);width:18px;font-size:.85rem;}
        .rank-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
        .rank-name{font-weight:600;font-size:.88rem;flex:1;}
        .rank-name small{display:block;font-weight:500;color:var(--gray);font-size:.72rem;}
        .rank-val{font-size:.8rem;font-weight:600;color:var(--pink);font-variant-numeric:tabular-nums;}
        .fc{display:flex;gap:8px;align-items:flex-end;margin-top:10px;}
        .fc-col{flex:1;text-align:center;}
        .fc-bar{border-radius:6px 6px 3px 3px;background:linear-gradient(180deg,var(--pink),#e6b7d2);margin:0 auto;width:70%;min-height:3px;}
        .fc-day{font-size:.68rem;font-weight:600;color:var(--gray);margin-top:5px;}
        .fc-h{font-size:.68rem;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;}
      `}</style>

      <div className="wrap">
        <h1>Solterrassen<span> ·</span> Gothenburg</h1>
        <p className="sub">Outdoor terraces and their hours of sun, calculated from the sun's real position</p>

        {/* Time controls */}
        <div className="card">
          <div className="row between">
            <div className="row">
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
              <button className="chip accent" onClick={jumpToNow}>Sun now</button>
              <button className="chip" onClick={() => setMinutes(9 * 60)}>Morning 09</button>
              <button className="chip" onClick={() => setMinutes(12 * 60)}>Lunch 12</button>
              <button className="chip" onClick={() => setMinutes(17 * 60)}>AW 17</button>
              <button className="chip" onClick={() => setMinutes(20 * 60)}>Evening 20</button>
            </div>
            <span className="stat"><b>{sunnyNowIds.size}</b> of {visible.length} in sun at {fmt(minutes)}</span>
          </div>

          <svg viewBox="0 0 360 96" style={{ width: "100%", marginTop: 6 }} aria-hidden="true">
            {goldenBands.map(([a, b], i) => (
              <rect key={i} x={arcX(a)} y="8" width={Math.max(2, arcX(b) - arcX(a))} height="68" fill="#f3d9e8" opacity=".55" rx="3" />
            ))}
            <line x1="20" y1="76" x2="340" y2="76" stroke="#dcd9e6" strokeWidth="1.5" strokeDasharray="3 5" />
            <path d={curvePath} fill="none" stroke={cloudy ? "#b3aec2" : "#d489b6"} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={arcX(minutes)} cy={arcY(sunNowPos.altitude)} r="6.5" fill={sunColor} stroke="#fff" strokeWidth="2" />
            {goldenBands.length > 0 && (
              <text x={arcX(goldenBands[goldenBands.length - 1][0])} y="90" fontSize="8.5" fill="#b57a9c" fontWeight="600">golden hour</text>
            )}
            <text x="20" y="90" fontSize="8.5" fill="#8e8a9c" fontWeight="600">04:00</text>
            <text x="318" y="90" fontSize="8.5" fill="#8e8a9c" fontWeight="600">23:00</text>
          </svg>

          <div className="row" style={{ marginTop: 2 }}>
            <span className="timebig">{fmt(minutes)}</span>
            <input type="range" min={START_MIN} max={END_MIN} step={5} value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Time of day" style={{ flex: 1 }} />
          </div>
          {sunNowPos.altitude <= 0 && <p className="note">The sun is below the horizon at this time.</p>}
        </div>

        {/* Filters */}
        <div className="card">
          <div className="row between">
            <div className="row">
              <span className="label">Faces</span>
              {["N", "E", "S", "W"].map((d) => (
                <button key={d} className={`chip ${dirFilter.includes(d) ? "on" : ""}`} onClick={() => toggleDir(d)}>{d}</button>
              ))}
              <button className={`chip cloud ${cloudy ? "on" : ""}`} onClick={() => setCloudy(!cloudy)}>
                {cloudy ? "☁ Cloudy today" : "☁ Cloudy?"}
              </button>
            </div>
            <button className={`chip ${addMode ? "on" : ""}`} onClick={() => { setAddMode(!addMode); setDraft(null); }}>
              {addMode ? "Click the map…" : "+ Add my own spot"}
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="mapbox">
          <div id="map" ref={mapEl} style={{ cursor: addMode ? "crosshair" : undefined }}>
            {!leafletReady && <p style={{ textAlign: "center", paddingTop: 200 }} className="note">Loading map…</p>}
          </div>
        </div>
        <p className="note" style={{ margin: "6px 2px 12px" }}>
          <span style={{ color: sunColor }}>●</span> in sun&nbsp;&nbsp;<span style={{ color: "#9fbee4" }}>●</span> in shade
          {cloudy && " · cloudy mode on: the sun is up there somewhere, just not for us"}
        </p>

        {/* New spot form */}
        {draft && (
          <div className="card detail">
            <h2>New spot</h2>
            <input className="field" placeholder="Name of the place" value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div className="row">
              <span className="stat">Terrace faces</span>
              <select className="field" value={draft.dir} onChange={(e) => setDraft({ ...draft, dir: e.target.value })}>
                {DIRS.map((d) => <option key={d}>{d}</option>)}
              </select>
              <label className="stat" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={draft.roof} onChange={(e) => setDraft({ ...draft, roof: e.target.checked })} /> Rooftop
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={saveDraft}>Save spot</button>
              <button className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Detail */}
        {selected && selProfile && (
          <div className="card detail">
            <div className="row between">
              <div>
                <h2>{selected.name}</h2>
                <p className="note" style={{ margin: "2px 0 10px" }}>{selected.area}</p>
              </div>
              <button className="heart" onClick={() => toggleFav(selected.id)} aria-label="Toggle favorite">
                {favorites.includes(selected.id) ? "♥" : "♡"}
              </button>
            </div>
            <div>
              <span className="tag">Faces {dirLabel(selected.aspect)}</span>
              {selected.roof && <span className="tag">Rooftop</span>}
              <span className="tag sun">{selProfile.hours > 0 ? `${selProfile.hours.toFixed(1)} h of sun` : "No sun this day"}</span>
              {selProfile.window && <span className="tag">Sun {fmt(selProfile.window[0])} – {fmt(selProfile.window[1])}</span>}
              {transition?.type === "leaving" && <span className="tag warn">Sun leaves around {fmt(transition.at)}</span>}
              {transition?.type === "arriving" && <span className="tag sun">Sun arrives around {fmt(transition.at)}</span>}
            </div>
            <div className="bar">
              {selProfile.steps.map((s, i) => (
                <div key={i} className="seg" style={{ background: s ? sunColor : "transparent" }} />
              ))}
            </div>
            <div className="ticks"><span>04</span><span>08</span><span>12</span><span>16</span><span>20</span><span>23</span></div>

            <p className="label" style={{ margin: "16px 0 0" }}>Next 7 days</p>
            <div className="fc">
              {forecast.map((f) => (
                <div key={f.ds} className="fc-col">
                  <div className="fc-h">{f.hours.toFixed(1)}</div>
                  <div className="fc-bar" style={{ height: 6 + (f.hours / maxForecast) * 52 }} />
                  <div className="fc-day">{f.day}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ranking */}
        <div className="card">
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="label">Leaderboard</span>
            <div className="row">
              <button className={`chip ${rankMode === "now" ? "on" : ""}`} onClick={() => setRankMode("now")}>Sun right now</button>
              <button className={`chip ${rankMode === "today" ? "on" : ""}`} onClick={() => setRankMode("today")}>Sunniest today</button>
            </div>
          </div>
          {ranking.length === 0 && <p className="note">Nothing in the sun at {fmt(minutes)}. Try another time.</p>}
          {ranking.map((r, i) => (
            <div key={r.v.id} className="rank-row" onClick={() => selectAndPan(r.v.id)}>
              <span className="rank-num">{i + 1}</span>
              <span className="rank-dot" style={{ background: r.sunny ? sunColor : "#9fbee4" }} />
              <span className="rank-name">{r.v.name}<small>{r.v.area}</small></span>
              <span className="rank-val">
                {rankMode === "now" ? `sun ${(r.sunLeft / 60).toFixed(1)} h more` : `${r.hours.toFixed(1)} h today`}
              </span>
            </div>
          ))}
        </div>

        <p className="note" style={{ textAlign: "center", marginTop: 16 }}>
          Sun position is calculated astronomically for the chosen date. Building shade is estimated from each
          terrace's direction and surroundings, and clouds are not included. Demo data for Gothenburg;
          favorites and added spots reset on reload. Map data © OpenStreetMap contributors.
        </p>
      </div>
    </div>
  );
}

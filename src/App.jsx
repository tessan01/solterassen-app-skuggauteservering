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

/* A wall is lit when the sun is above the horizon (with a small margin for
   the general urban skyline) and shines on the wall's outward-facing side. */
const MIN_ALT = 3;      // degrees above horizon before low sun counts
const FACE_SPREAD = 88; // sun azimuth must be within this many degrees of the wall normal
const wallLit = (normal, pos) => pos.altitude > MIN_ALT && angDiff(pos.azimuth, normal) < FACE_SPREAD;

/* ---------------- Geometry helpers ---------------- */
const bearing = (p1, p2) => {
  // planar approximation, fine at city scale
  const dx = (p2.lng - p1.lng) * Math.cos(((p1.lat + p2.lat) / 2) * RAD);
  const dy = p2.lat - p1.lat;
  return (Math.atan2(dx, dy) / RAD + 360) % 360;
};
const signedArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++)
    a += (pts[i].lng * pts[i + 1].lat - pts[i + 1].lng * pts[i].lat);
  return a; // > 0 means counterclockwise
};

/* ---------------- Time helpers ---------------- */
const GBG = { lat: 57.7025, lng: 11.958 };
const START_MIN = 4 * 60, END_MIN = 23 * 60, STEP = 15;
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dateAt = (dateStr, minutes) => { const d = new Date(`${dateStr}T00:00:00`); d.setMinutes(minutes); return d; };
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const weekday = (dateStr) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${dateStr}T12:00:00`).getDay()];

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const dirLabel = (deg) => DIRS[Math.round((deg % 360) / 45) % 8];

const wallDayProfile = (wall, dateStr) => {
  const steps = [];
  for (let m = START_MIN; m <= END_MIN; m += STEP)
    steps.push(wallLit(wall.normal, sunPosition(dateAt(dateStr, m), wall.mid.lat, wall.mid.lng)));
  const first = steps.indexOf(true), last = steps.lastIndexOf(true);
  return {
    steps,
    hours: (steps.filter(Boolean).length * STEP) / 60,
    window: first === -1 ? null : [START_MIN + first * STEP, START_MIN + last * STEP],
  };
};

/* ---------------- Component ---------------- */
export default function App() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowMin = Math.min(END_MIN, Math.max(START_MIN, now.getHours() * 60 + now.getMinutes()));

  const [dateStr, setDateStr] = useState(todayStr);
  const [minutes, setMinutes] = useState(nowMin);
  const [cloudy, setCloudy] = useState(false);
  const [sunnyOnly, setSunnyOnly] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);
  const [zoomedOut, setZoomedOut] = useState(true);
  const [loading, setLoading] = useState(false);
  const [wallCount, setWallCount] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [selectedWall, setSelectedWall] = useState(null); // {normal, mid}

  const mapEl = useRef(null), mapRef = useRef(null);
  const wallLayerRef = useRef(null), footprintLayerRef = useRef(null);
  const wallsRef = useRef([]); // [{line, normal, mid}]
  const fetchedBoxRef = useRef(null);
  const selectedLineRef = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { dateStr, minutes, cloudy, sunnyOnly };

  /* ---- Load Leaflet ---- */
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

  /* ---- Wall coloring ---- */
  const recolorWalls = () => {
    const { dateStr, minutes, cloudy, sunnyOnly } = stateRef.current;
    const pos = sunPosition(dateAt(dateStr, minutes), GBG.lat, GBG.lng); // one sun for the whole city
    const sunCol = cloudy ? "#a7a3b4" : "#d489b6";
    for (const w of wallsRef.current) {
      const lit = wallLit(w.normal, pos);
      w.line.setStyle({
        color: lit ? sunCol : "#9fbee4",
        opacity: sunnyOnly && !lit ? 0.12 : 0.95,
        weight: w.line === selectedLineRef.current ? 7 : 3.5,
      });
    }
  };
  useEffect(() => { recolorWalls(); }, [minutes, dateStr, cloudy, sunnyOnly, wallCount, selectedWall]);

  /* ---- Fetch buildings from OpenStreetMap (Overpass API) ---- */
  const loadBuildings = async () => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getZoom() < 16) { setZoomedOut(true); return; }
    setZoomedOut(false);

    const b = map.getBounds();
    const fb = fetchedBoxRef.current;
    if (fb && fb.contains(b)) return; // already have this area

    setLoading(true); setLoadError(false);
    const pad = b.pad(0.25);
    const q = `[out:json][timeout:25];(way["building"](${pad.getSouth()},${pad.getWest()},${pad.getNorth()},${pad.getEast()}););out geom 2500;`;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: "data=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const data = await res.json();
      buildWalls(data.elements || []);
      fetchedBoxRef.current = pad;
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  };

  const buildWalls = (elements) => {
    const L = window.L;
    wallLayerRef.current.clearLayers();
    footprintLayerRef.current.clearLayers();
    wallsRef.current = [];
    selectedLineRef.current = null;

    for (const el of elements) {
      if (!el.geometry || el.geometry.length < 4) continue;
      const pts = el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
      const ccw = signedArea(pts) > 0;

      L.polygon(pts, {
        color: "#c9c5d6", weight: 0, fillColor: "#dedbe8", fillOpacity: 0.5, interactive: false,
      }).addTo(footprintLayerRef.current);

      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const brg = bearing(p1, p2);
        const normal = (brg + (ccw ? 90 : 270)) % 360;
        const mid = { lat: (p1.lat + p2.lat) / 2, lng: (p1.lng + p2.lng) / 2 };
        const line = L.polyline([p1, p2], { color: "#9fbee4", weight: 3.5, opacity: 0.95 });
        line.on("click", () => {
          selectedLineRef.current = line;
          setSelectedWall({ normal, mid });
        });
        line.addTo(wallLayerRef.current);
        wallsRef.current.push({ line, normal, mid });
      }
    }
    setWallCount(wallsRef.current.length);
    recolorWalls();
  };

  /* ---- Init map ---- */
  useEffect(() => {
    if (!leafletReady || mapRef.current || !mapEl.current) return;
    const L = window.L;
    const map = L.map(mapEl.current, { preferCanvas: true }).setView([57.7027, 11.9635], 17);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      className: "osm-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    footprintLayerRef.current = L.layerGroup().addTo(map);
    wallLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("moveend", loadBuildings);
    loadBuildings();
  }, [leafletReady]);

  /* ---- Sun curve, golden hour ---- */
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

  /* ---- Selected wall detail ---- */
  const wallProfile = useMemo(
    () => (selectedWall ? wallDayProfile(selectedWall, dateStr) : null),
    [selectedWall, dateStr]
  );
  const transition = useMemo(() => {
    if (!wallProfile) return null;
    const idx = Math.round((minutes - START_MIN) / STEP);
    const s = wallProfile.steps;
    if (idx < 0 || idx >= s.length) return null;
    if (s[idx]) {
      let j = idx; while (j < s.length && s[j]) j++;
      if (j < s.length && START_MIN + j * STEP - minutes <= 60) return { type: "leaving", at: START_MIN + j * STEP };
    } else {
      let j = idx; while (j < s.length && !s[j]) j++;
      if (j < s.length && START_MIN + j * STEP - minutes <= 60) return { type: "arriving", at: START_MIN + j * STEP };
    }
    return null;
  }, [wallProfile, minutes]);

  const forecast = useMemo(() => {
    if (!selectedWall) return null;
    return Array.from({ length: 7 }, (_, i) => {
      const ds = addDays(dateStr, i);
      return { ds, day: weekday(ds), hours: wallDayProfile(selectedWall, ds).hours };
    });
  }, [selectedWall, dateStr]);
  const maxForecast = forecast ? Math.max(1, ...forecast.map((f) => f.hours)) : 1;

  const jumpToNow = () => {
    setDateStr(todayStr);
    const n = new Date();
    setMinutes(Math.min(END_MIN, Math.max(START_MIN, n.getHours() * 60 + n.getMinutes())));
  };

  const arcX = (m) => 20 + ((m - START_MIN) / (END_MIN - START_MIN)) * 320;
  const arcY = (alt) => 76 - Math.max(-8, alt) * 1.1;
  const curvePath = curve.map(([m, a], i) => `${i ? "L" : "M"}${arcX(m).toFixed(1)},${arcY(a).toFixed(1)}`).join(" ");
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
        .wrap{max-width:860px;margin:0 auto;}
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
        .label{font-family:'Outfit';font-weight:600;font-size:.95rem;margin:0;}
        .mapbox{border-radius:16px;overflow:hidden;border:1px solid var(--line);box-shadow:0 1px 3px rgba(35,32,48,.05);position:relative;}
        #map{height:480px;width:100%;background:var(--gray-soft);}
        .osm-tiles{filter:saturate(.9) hue-rotate(-8deg);}
        .map-banner{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:800;
          background:rgba(35,32,48,.85);color:#fff;border-radius:999px;padding:7px 16px;
          font-size:.8rem;font-weight:600;pointer-events:none;white-space:nowrap;}
        .detail h2{font-family:'Outfit';font-weight:600;margin:0;font-size:1.15rem;}
        .bar{display:flex;height:16px;border-radius:8px;overflow:hidden;margin:10px 0 4px;background:var(--blue-soft);}
        .seg{flex:1;}
        .ticks{display:flex;justify-content:space-between;font-size:.68rem;color:var(--gray);font-weight:600;}
        .tag{display:inline-block;background:var(--gray-soft);border-radius:999px;padding:3px 10px;
          font-size:.73rem;font-weight:600;margin:0 6px 6px 0;color:var(--ink);}
        .tag.sun{background:var(--pink-soft);color:#a5567f;}
        .tag.warn{background:#fdeef4;color:#b04a7e;}
        .note{font-size:.75rem;color:var(--gray);}
        .fc{display:flex;gap:8px;align-items:flex-end;margin-top:10px;}
        .fc-col{flex:1;text-align:center;}
        .fc-bar{border-radius:6px 6px 3px 3px;background:linear-gradient(180deg,var(--pink),#e6b7d2);margin:0 auto;width:70%;min-height:3px;}
        .fc-day{font-size:.68rem;font-weight:600;color:var(--gray);margin-top:5px;}
        .fc-h{font-size:.68rem;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;}
      `}</style>

      <div className="wrap">
        <h1>Solväggen<span> ·</span> Gothenburg</h1>
        <p className="sub">Every building facade in the city, colored by whether the sun reaches it</p>

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
            <span className="stat"><b>{Math.round(wallCount / 2)}</b> walls loaded</span>
          </div>

          <svg viewBox="0 0 360 96" style={{ width: "100%", marginTop: 6 }} aria-hidden="true">
            {goldenBands.map(([a, b], i) => (
              <rect key={i} x={arcX(a)} y="8" width={Math.max(2, arcX(b) - arcX(a))} height="68" fill="#f3d9e8" opacity=".55" rx="3" />
            ))}
            <line x1="20" y1="76" x2="340" y2="76" stroke="#dcd9e6" strokeWidth="1.5" strokeDasharray="3 5" />
            <path d={curvePath} fill="none" stroke={sunColor} strokeWidth="2.5" strokeLinecap="round" />
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

        {/* Options */}
        <div className="card">
          <div className="row between">
            <div className="row">
              <button className={`chip ${sunnyOnly ? "on" : ""}`} onClick={() => setSunnyOnly(!sunnyOnly)}>
                ☀ Sunny walls only
              </button>
              <button className={`chip cloud ${cloudy ? "on" : ""}`} onClick={() => setCloudy(!cloudy)}>
                {cloudy ? "☁ Cloudy today" : "☁ Cloudy?"}
              </button>
            </div>
            <span className="stat">Click any wall for its sun schedule</span>
          </div>
        </div>

        {/* Map */}
        <div className="mapbox">
          {zoomedOut && <div className="map-banner">Zoom in to a neighborhood to load walls</div>}
          {loading && <div className="map-banner">Loading buildings…</div>}
          {loadError && !loading && <div className="map-banner">Couldn't reach OpenStreetMap, try moving the map</div>}
          <div id="map" ref={mapEl}>
            {!leafletReady && <p style={{ textAlign: "center", paddingTop: 220 }} className="note">Loading map…</p>}
          </div>
        </div>
        <p className="note" style={{ margin: "6px 2px 12px" }}>
          <span style={{ color: sunColor }}>▬</span> wall in sun&nbsp;&nbsp;<span style={{ color: "#9fbee4" }}>▬</span> wall in shade
          {cloudy && " · cloudy mode on: the sun is up there somewhere, just not for us"}
        </p>

        {/* Selected wall */}
        {selectedWall && wallProfile && (
          <div className="card detail">
            <h2>Wall facing {dirLabel(selectedWall.normal)}</h2>
            <p className="note" style={{ margin: "2px 0 10px" }}>
              {selectedWall.mid.lat.toFixed(5)}, {selectedWall.mid.lng.toFixed(5)}
            </p>
            <div>
              <span className="tag sun">{wallProfile.hours > 0 ? `${wallProfile.hours.toFixed(1)} h of sun` : "No sun this day"}</span>
              {wallProfile.window && <span className="tag">Sun {fmt(wallProfile.window[0])} – {fmt(wallProfile.window[1])}</span>}
              {transition?.type === "leaving" && <span className="tag warn">Sun leaves around {fmt(transition.at)}</span>}
              {transition?.type === "arriving" && <span className="tag sun">Sun arrives around {fmt(transition.at)}</span>}
            </div>
            <div className="bar">
              {wallProfile.steps.map((s, i) => (
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

        <p className="note" style={{ textAlign: "center", marginTop: 16 }}>
          Building shapes come live from OpenStreetMap. A wall is marked sunny when the sun stands above
          the horizon on that wall's side; shadows cast by neighboring buildings are not yet modeled,
          and clouds are not included. Map © OpenStreetMap contributors © CARTO.
        </p>
      </div>
    </div>
  );
}

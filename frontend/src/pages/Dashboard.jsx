import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

const DEMO_WEATHER = {
  temperature: 29.4,
  humidity: 72,
  wind_speed: 8.2,
  rainfall: 1.2,
  soil_moisture: 52,
  source: "demo-preview",
};
const DEMO_REC = {
  top_recommendation: {
    crop: "Rice", emoji: "🌾",
    confidence: 0.92,
    reasoning: "High temperature with abundant soil moisture and suitable pH ideal for paddy rice",
  },
  all_crops: [
    { crop:"Rice",      emoji:"🌾", confidence:0.92, reasoning:"High temp + moisture ideal for paddy rice" },
    { crop:"Maize",     emoji:"🌽", confidence:0.88, reasoning:"Warm climate with moderate moisture" },
    { crop:"Yam",       emoji:"🥔", confidence:0.82, reasoning:"Warm conditions with moderate soil moisture" },
    { crop:"Cassava",   emoji:"🌿", confidence:0.70, reasoning:"Drought-tolerant fallback crop" },
  ],
  conditions_snapshot: { temperature:29.4, humidity:72, soil_moisture:52, soil_ph:6.1, rainfall:1.2 },
  triggered_by: "autonomous_cycle",
  timestamp: new Date().toISOString(),
};

export default function Dashboard({ selectedLoc }) {
  const [weather, setWeather]   = useState(null);
  const [rec, setRec]           = useState(null);
  const [loading, setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [manualPh, setManualPh] = useState("");
  const [phSubmitting, setPhSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, rRes] = await Promise.all([
        fetch(`${API}/api/weather/current`),
        fetch(`${API}/api/recommendation/current`),
      ]);
      if (wRes.ok) setWeather(await wRes.json());
      if (rRes.ok) {
        const rData = await rRes.json();
        if (!rData.message) setRec(rData);
      }
      setLastUpdate(new Date());
    } catch {
      // Preview mode: use demo data
      setWeather(DEMO_WEATHER);
      setRec(DEMO_REC);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [selectedLoc, fetchData]);
  useEffect(() => {
    const iv = setInterval(fetchData, 10000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleManualPh = async () => {
    if (!manualPh) return;
    setPhSubmitting(true);
    try {
      const r = await fetch(`${API}/api/soil/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soil_ph: parseFloat(manualPh) }),
      });
      if (r.ok) { const d = await r.json(); if (d.recommendation) setRec(d.recommendation); }
      setManualPh("");
    } catch {} finally { setPhSubmitting(false); }
  };

  const top     = rec?.top_recommendation;
  const conds   = rec?.conditions_snapshot || weather || {};
  const allCrops = rec?.all_crops || [];

  const triggerLabel = (t) => {
    if (!t) return "";
    const map = {
      autonomous_cycle: "🔄 Autonomous Cycle",
      condition_change: "⚡ Condition Change Detected",
      location_change:  "📍 Location Changed",
      manual_soil_input:"✏️ Manual Input",
    };
    return map[t] || t;
  };

  return (
    <div className="fade-in">
      {loading ? (
        <div style={{ textAlign:"center", paddingTop:60 }}>
          <div className="spinner" />
          <p style={{ marginTop:12, color:"var(--text-muted)", fontSize:13 }}>
            Agent system initialising…
          </p>
        </div>
      ) : (
        <>
          {/* ── HERO RECOMMENDATION ── */}
          {top && (
            <div className="hero-strip" style={{ marginBottom: 20 }}>
              <p className="hero-label">Current Recommendation</p>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <span style={{ fontSize:52 }}>{top.emoji || "🌱"}</span>
                <div>
                  <div className="hero-crop-name">{top.crop}</div>
                  <div className="hero-confidence">
                    {Math.round(top.confidence * 100)}% confidence
                  </div>
                  <div className="hero-trigger">{triggerLabel(rec.triggered_by)}</div>
                </div>
              </div>
              <p style={{ marginTop:12, fontSize:13, color:"rgba(255,255,255,0.65)", maxWidth:500 }}>
                {top.reasoning}
              </p>
              {lastUpdate && (
                <p style={{ marginTop:8, fontSize:11, color:"rgba(255,255,255,0.35)" }}>
                  Last updated {lastUpdate.toLocaleTimeString()}
                  {weather?.source === "open-meteo-live" && " · Live weather data"}
                  {weather?.source === "demo-preview" && " · Preview mode"}
                </p>
              )}
            </div>
          )}

          {/* ── ENVIRONMENT METRICS ── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <p className="card-title">🌡️ Current Conditions</p>
            <div className="env-grid">
              <EnvCard icon="🌡️" label="Temperature"   value={conds.temperature}  unit="°C"  color="#e67e22" />
              <EnvCard icon="💧" label="Humidity"       value={conds.humidity}     unit="%"   color="#2980b9" />
              <EnvCard icon="🌱" label="Soil Moisture"  value={conds.soil_moisture} unit="%"  color="#27ae60" />
              <EnvCard icon="⚗️" label="Soil pH"        value={conds.soil_ph}      unit="pH"  color="#8e44ad" />
              <EnvCard icon="💨" label="Wind Speed"     value={weather?.wind_speed} unit="km/h" color="#7f8c8d" />
              <EnvCard icon="🌧️" label="Rainfall"       value={weather?.rainfall}  unit="mm"  color="#3498db" />
            </div>
          </div>

          {/* ── ALL CROP RECOMMENDATIONS ── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <p className="card-title" style={{ marginBottom:0 }}>🌾 Crop Suitability Ranking</p>
              <span style={{ fontSize:11, color:"var(--text-muted)" }}>
                {allCrops.length} crops evaluated
              </span>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              {allCrops.map((crop, i) => (
                <div key={crop.crop} className={`crop-card ${i === 0 ? "top-pick" : ""}`}>
                  {i === 0 && <span className="top-badge">Top Pick</span>}
                  <span className="crop-emoji">{crop.emoji}</span>
                  <div className="crop-name">{crop.crop}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text-soft)", marginTop:4 }}>
                    <span>Suitability</span>
                    <span style={{ fontWeight:600, color:"var(--forest)" }}>
                      {Math.round(crop.confidence * 100)}%
                    </span>
                  </div>
                  <div className="crop-confidence-bar">
                    <div
                      className="crop-confidence-fill"
                      style={{ width: `${crop.confidence * 100}%` }}
                    />
                  </div>
                  <p className="crop-reasoning">{crop.reasoning}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── MANUAL SOIL pH OVERRIDE ── */}
          <div className="card">
            <p className="card-title">✏️ Manual Soil pH Input</p>
            <p style={{ fontSize:13, color:"var(--text-soft)", marginBottom:14 }}>
              Override the derived soil pH to trigger a reactive re-evaluation by the Recommendation Agent.
              The Soil Agent normally derives pH from environmental conditions.
            </p>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <input
                type="number"
                min="4" max="9" step="0.1"
                placeholder="e.g. 6.5"
                value={manualPh}
                onChange={e => setManualPh(e.target.value)}
                style={{
                  padding:"8px 12px", border:"1px solid var(--border)",
                  borderRadius: "var(--r-sm)", fontFamily:"var(--font-body)",
                  fontSize:14, width:120, outline:"none",
                  transition:"border-color 0.15s"
                }}
                onFocus={e => e.target.style.borderColor="var(--leaf)"}
                onBlur={e => e.target.style.borderColor="var(--border)"}
              />
              <button
                onClick={handleManualPh}
                disabled={phSubmitting || !manualPh}
                style={{
                  padding:"8px 18px", background:"var(--forest)", color:"white",
                  border:"none", borderRadius:"var(--r-sm)", cursor:"pointer",
                  fontFamily:"var(--font-body)", fontSize:13, fontWeight:500,
                  opacity: phSubmitting || !manualPh ? 0.6 : 1,
                  transition:"all 0.15s"
                }}
              >
                {phSubmitting ? "Updating…" : "Apply & Re-evaluate"}
              </button>
              <span style={{ fontSize:12, color:"var(--text-muted)" }}>
                Valid range: 4.5 – 8.0
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EnvCard({ icon, label, value, unit, color }) {
  return (
    <div className="env-card">
      <div className="env-icon">{icon}</div>
      <div className="env-label">{label}</div>
      <div className="env-value" style={{ color }}>
        {value != null ? (typeof value === "number" ? value.toFixed(1) : value) : "—"}
      </div>
      <div className="env-unit">{unit}</div>
    </div>
  );
}

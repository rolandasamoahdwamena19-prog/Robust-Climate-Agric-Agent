import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

// Generate demo data for preview
const now = Date.now();
const DEMO_ENV = Array.from({ length: 12 }, (_, i) => ({
  id: i+1,
  timestamp: new Date(now - (11-i)*60000).toISOString(),
  location: "Accra, Ghana",
  temperature: +(28 + Math.sin(i/3)*3 + Math.random()*0.5).toFixed(1),
  humidity:    +(68 + Math.cos(i/4)*8 + Math.random()*2).toFixed(1),
  soil_moisture: +(45 + Math.sin(i/2)*12 + Math.random()*3).toFixed(1),
  soil_ph: +(6.1 + Math.sin(i)*0.3).toFixed(2),
  wind_speed: +(7 + Math.random()*4).toFixed(1),
  rainfall:  +(Math.random() > 0.7 ? Math.random()*5 : 0).toFixed(1),
  source: "demo",
}));

const DEMO_RECS = Array.from({ length: 8 }, (_, i) => ({
  id: i+1,
  timestamp: new Date(now - (7-i)*60000).toISOString(),
  crop: ["Rice","Rice","Maize","Rice","Yam","Rice","Maize","Rice"][i],
  confidence: [0.92,0.91,0.88,0.93,0.82,0.90,0.87,0.92][i],
  reasoning: "Environmental conditions evaluated by Recommendation Agent",
  triggered_by: i%3===0 ? "condition_change" : "autonomous_cycle",
}));

const CROP_COLORS = {
  Rice: "#27ae60", Maize: "#f39c12", Cassava: "#16a085",
  Yam: "#8e44ad", Cocoa: "#6d4c41", Groundnut: "#e67e22",
};

export default function History() {
  const [envData, setEnvData]   = useState([]);
  const [recData, setRecData]   = useState([]);
  const [loading, setLoading]   = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [eRes, rRes] = await Promise.all([
        fetch(`${API}/api/environment/history?limit=24`),
        fetch(`${API}/api/recommendations/history?limit=20`),
      ]);
      if (eRes.ok) setEnvData(await eRes.json());
      if (rRes.ok) setRecData(await rRes.json());
    } catch {
      setEnvData(DEMO_ENV);
      setRecData(DEMO_RECS);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const iv = setInterval(fetchAll, 15000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const fmtDate = (ts) => new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });

  // Simple sparkline
  const Sparkline = ({ data, color = "var(--leaf)" }) => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const w = 120, h = 36;
    const points = data.map((v, i) =>
      `${(i / (data.length-1)) * w},${h - ((v-min)/range)*h}`
    ).join(" ");
    return (
      <svg width={w} height={h} style={{ overflow:"visible" }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  };

  const recentEnv   = envData.slice(0, 12).reverse();
  const tempSeries  = recentEnv.map(r => r.temperature);
  const moistSeries = recentEnv.map(r => r.soil_moisture);
  const humSeries   = recentEnv.map(r => r.humidity);

  // Crop frequency
  const cropFreq = recData.reduce((acc, r) => {
    acc[r.crop] = (acc[r.crop] || 0) + 1; return acc;
  }, {});
  const maxFreq = Math.max(...Object.values(cropFreq), 1);

  return (
    <div className="fade-in">
      {loading ? (
        <div style={{ textAlign:"center", paddingTop:60 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* ── SPARKLINES SUMMARY ── */}
          <div className="grid-3" style={{ marginBottom:20 }}>
            {[
              { label:"Temperature", series:tempSeries, unit:"°C", color:"#e67e22", icon:"🌡️" },
              { label:"Soil Moisture", series:moistSeries, unit:"%", color:"#27ae60", icon:"💧" },
              { label:"Humidity", series:humSeries, unit:"%", color:"#3498db", icon:"🌫️" },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <p style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.7px" }}>
                      {s.icon} {s.label}
                    </p>
                    <p style={{ fontSize:28, fontWeight:300, color:s.color, marginTop:4 }}>
                      {s.series.length > 0 ? s.series[s.series.length-1].toFixed(1) : "—"}
                      <span style={{ fontSize:13, color:"var(--text-muted)", marginLeft:3 }}>{s.unit}</span>
                    </p>
                  </div>
                  <Sparkline data={s.series} color={s.color} />
                </div>
                <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:8 }}>
                  {s.series.length} readings · Last {recentEnv.length > 0 ? fmt(recentEnv[recentEnv.length-1].timestamp) : "—"}
                </p>
              </div>
            ))}
          </div>

          {/* ── CROP RECOMMENDATION FREQUENCY ── */}
          {Object.keys(cropFreq).length > 0 && (
            <div className="card" style={{ marginBottom:20 }}>
              <p className="card-title">🌾 Recommendation Frequency</p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {Object.entries(cropFreq)
                  .sort((a,b) => b[1]-a[1])
                  .map(([crop, count]) => (
                  <div key={crop} style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ width:80, fontSize:13, fontWeight:500, color:"var(--text-mid)" }}>{crop}</span>
                    <div style={{ flex:1, height:20, background:"var(--surface-2)", borderRadius:4, overflow:"hidden" }}>
                      <div style={{
                        width:`${(count/maxFreq)*100}%`, height:"100%",
                        background: CROP_COLORS[crop] || "var(--leaf)",
                        borderRadius:4, transition:"width 1s ease",
                        display:"flex", alignItems:"center", paddingLeft:8
                      }}>
                        {count >= 2 && (
                          <span style={{ fontSize:10, color:"white", fontWeight:600 }}>{count}×</span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize:12, color:"var(--text-muted)", width:40, textAlign:"right" }}>
                      {((count/recData.length)*100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RECOMMENDATION HISTORY TABLE ── */}
          <div className="card" style={{ marginBottom:20 }}>
            <p className="card-title">📋 Recommendation History</p>
            <div style={{ overflowX:"auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Crop</th>
                    <th>Confidence</th>
                    <th>Triggered By</th>
                    <th>Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {recData.slice(0,15).map(r => (
                    <tr key={r.id}>
                      <td style={{ fontFamily:"var(--font-mono)", fontSize:11 }}>
                        {fmtDate(r.timestamp)}
                      </td>
                      <td>
                        <span style={{
                          fontWeight:600, color: CROP_COLORS[r.crop] || "var(--forest)",
                          display:"flex", alignItems:"center", gap:4
                        }}>
                          {r.crop}
                        </span>
                      </td>
                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:60, height:4, background:"var(--surface-3)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{
                              width:`${r.confidence*100}%`, height:"100%",
                              background: CROP_COLORS[r.crop] || "var(--leaf)"
                            }} />
                          </div>
                          <span style={{ fontSize:12 }}>{Math.round(r.confidence*100)}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`tag ${
                          r.triggered_by === "condition_change" ? "tag-amber" :
                          r.triggered_by === "location_change"  ? "tag-blue" : "tag-green"
                        }`} style={{ fontSize:10 }}>
                          {r.triggered_by?.replace(/_/g," ")}
                        </span>
                      </td>
                      <td style={{ fontSize:12, color:"var(--text-soft)", maxWidth:220 }}>
                        {r.reasoning?.substring(0,80)}{r.reasoning?.length > 80 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ENVIRONMENT DATA TABLE ── */}
          <div className="card">
            <p className="card-title">🌍 Environmental Data Log</p>
            <div style={{ overflowX:"auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Location</th>
                    <th>Temp (°C)</th>
                    <th>Humidity (%)</th>
                    <th>Moisture (%)</th>
                    <th>pH</th>
                    <th>Rain (mm)</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {envData.slice(0,15).map(r => (
                    <tr key={r.id}>
                      <td style={{ fontFamily:"var(--font-mono)", fontSize:11 }}>{fmtDate(r.timestamp)}</td>
                      <td style={{ fontSize:12 }}>{r.location}</td>
                      <td style={{ color:"#e67e22", fontWeight:500 }}>{r.temperature?.toFixed(1)}</td>
                      <td style={{ color:"#3498db" }}>{r.humidity?.toFixed(0)}</td>
                      <td style={{ color:"#27ae60" }}>{r.soil_moisture?.toFixed(1)}</td>
                      <td style={{ color:"#8e44ad" }}>{r.soil_ph?.toFixed(2)}</td>
                      <td>{r.rainfall?.toFixed(1)}</td>
                      <td>
                        <span className={`tag ${r.source?.includes("live") ? "tag-green" : r.source?.includes("manual") ? "tag-blue" : "tag-amber"}`}
                          style={{ fontSize:9 }}>
                          {r.source === "open-meteo-live" ? "live" : r.source === "demo" ? "demo" : r.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

const DEMO_ALERTS = [
  { id:3, timestamp: new Date(Date.now()-60000).toISOString(), alert_type:"condition_change", message:"🔄 Conditions changed (Δtemp 2.3°C, Δmoisture 12.5%) — recommendation updated", is_read:0 },
  { id:2, timestamp: new Date(Date.now()-120000).toISOString(), alert_type:"drought_risk", message:"⚠️ Soil moisture critically low (18%) — irrigation advised", is_read:0 },
  { id:1, timestamp: new Date(Date.now()-240000).toISOString(), alert_type:"condition_change", message:"🔄 Conditions changed (Δtemp 3.1°C, Δmoisture 8.2%) — recommendation updated", is_read:1 },
];

const ALERT_STYLES = {
  drought_risk:     { color:"#c0392b", bg:"#fce8e8", border:"#f5b8b8", icon:"🏜️", label:"Drought Risk" },
  waterlog_risk:    { color:"#1a4d8f", bg:"#e3f0ff", border:"#a8c8f5", icon:"🌊", label:"Waterlogging Risk" },
  condition_change: { color:"#a0522d", bg:"#fff3e0", border:"#f5cfa0", icon:"⚡", label:"Condition Change" },
  default:          { color:"#444",    bg:"#f5f5f5", border:"#ddd",    icon:"ℹ️", label:"Alert" },
};

export default function Alerts({ onRead }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/alerts`);
      if (r.ok) setAlerts(await r.json());
    } catch {
      setAlerts(DEMO_ALERTS);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  useEffect(() => {
    const iv = setInterval(fetchAlerts, 6000);
    return () => clearInterval(iv);
  }, [fetchAlerts]);

  const markRead = async (id) => {
    try {
      await fetch(`${API}/api/alerts/${id}/read`, { method:"POST" });
    } catch {}
    setAlerts(a => a.map(x => x.id === id ? { ...x, is_read:1 } : x));
    onRead?.();
  };

  const markAllRead = async () => {
    const unread = alerts.filter(a => !a.is_read);
    for (const a of unread) {
      try { await fetch(`${API}/api/alerts/${a.id}/read`, { method:"POST" }); } catch {}
    }
    setAlerts(a => a.map(x => ({ ...x, is_read:1 })));
    onRead?.();
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;
  const fmtDate = (ts) => new Date(ts).toLocaleString([], {
    month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit"
  });

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:18, color:"var(--forest)" }}>
            Reactive Agent Alerts
          </h2>
          <p style={{ fontSize:13, color:"var(--text-muted)", marginTop:4 }}>
            The system raises alerts autonomously when environmental thresholds are crossed or conditions change significantly.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{
              padding:"8px 16px", background:"var(--forest)", color:"white",
              border:"none", borderRadius:"var(--r-sm)", cursor:"pointer",
              fontSize:13, fontFamily:"var(--font-body)"
            }}
          >
            Mark all read ({unreadCount})
          </button>
        )}
      </div>

      {/* Alert type legend */}
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">🔔 Alert Types — Reactive Behaviours</p>
        <div className="grid-3" style={{ gap:12 }}>
          {[
            { type:"drought_risk",     when:"Soil moisture drops below 20%", who:"Soil Agent" },
            { type:"waterlog_risk",    when:"Soil moisture exceeds 80%",     who:"Soil Agent" },
            { type:"condition_change", when:"Temp changes >2°C or moisture >10%", who:"Recommendation Agent" },
          ].map(({ type, when, who }) => {
            const s = ALERT_STYLES[type];
            return (
              <div key={type} style={{
                padding:"14px 16px", background:s.bg, border:`1px solid ${s.border}`,
                borderRadius:"var(--r-sm)"
              }}>
                <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
                <div style={{ fontWeight:600, color:s.color, fontSize:13 }}>{s.label}</div>
                <div style={{ fontSize:12, color:"var(--text-soft)", marginTop:4 }}>
                  <strong>Trigger:</strong> {when}
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:3 }}>
                  Raised by: {who}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts list */}
      {loading ? (
        <div style={{ textAlign:"center", paddingTop:40 }}>
          <div className="spinner" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="card" style={{ textAlign:"center", padding:"40px 20px" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
          <p style={{ fontFamily:"var(--font-display)", fontSize:18, color:"var(--forest)" }}>
            No alerts — conditions are normal
          </p>
          <p style={{ fontSize:13, color:"var(--text-muted)", marginTop:8 }}>
            Agents are monitoring continuously. Alerts will appear here when thresholds are crossed.
          </p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {alerts.map(alert => {
            const s = ALERT_STYLES[alert.alert_type] || ALERT_STYLES.default;
            return (
              <div key={alert.id} style={{
                padding:"16px 18px",
                background: alert.is_read ? "white" : s.bg,
                border:`1px solid ${alert.is_read ? "var(--border-soft)" : s.border}`,
                borderRadius:"var(--r)",
                display:"flex", alignItems:"flex-start", gap:14,
                transition:"all 0.2s",
                opacity: alert.is_read ? 0.65 : 1,
              }}>
                <span style={{ fontSize:24, flexShrink:0 }}>{s.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{
                      fontSize:11, fontWeight:700, color:s.color,
                      textTransform:"uppercase", letterSpacing:"0.5px"
                    }}>{s.label}</span>
                    {!alert.is_read && (
                      <span style={{
                        background:s.color, color:"white", fontSize:9,
                        padding:"1px 6px", borderRadius:10, fontWeight:700
                      }}>NEW</span>
                    )}
                  </div>
                  <p style={{ fontSize:13.5, color:"var(--text-dark)", marginBottom:6 }}>
                    {alert.message}
                  </p>
                  <p style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
                    {fmtDate(alert.timestamp)}
                  </p>
                </div>
                {!alert.is_read && (
                  <button
                    onClick={() => markRead(alert.id)}
                    style={{
                      padding:"5px 12px", background:"white",
                      border:`1px solid ${s.border}`, borderRadius:"var(--r-sm)",
                      color:s.color, fontSize:12, cursor:"pointer", flexShrink:0,
                      fontFamily:"var(--font-body)"
                    }}
                  >
                    Dismiss
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

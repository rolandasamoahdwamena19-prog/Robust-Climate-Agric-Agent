import { useState, useEffect, useCallback } from "react";
import Dashboard from "./pages/Dashboard";
import AgentMonitor from "./pages/AgentMonitor";
import History from "./pages/History";
import Alerts from "./pages/Alerts";
import "./index.css";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "🌱" },
  { id: "agents",    label: "Agent Monitor", icon: "🤖" },
  { id: "history",   label: "Field History", icon: "📊" },
  { id: "alerts",    label: "Alerts", icon: "🔔" },
];

const GHANA_LOCATIONS = [
  { name: "Accra, Ghana",       lat: 5.6037,  lon: -0.1870 },
  { name: "Kumasi, Ghana",      lat: 6.6884,  lon: -1.6244 },
  { name: "Tamale, Ghana",      lat: 9.4008,  lon: -0.8393 },
  { name: "Cape Coast, Ghana",  lat: 5.1054,  lon: -1.2466 },
  { name: "Bolgatanga, Ghana",  lat: 10.7856, lon: -0.8514 },
  { name: "Ho, Ghana",          lat: 6.6100,  lon: 0.4700  },
];

export default function App() {
  const [page, setPage]               = useState("dashboard");
  const [status, setStatus]           = useState(null);
  const [alertCount, setAlertCount]   = useState(0);
  const [locationOpen, setLocationOpen] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(GHANA_LOCATIONS[0]);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("http://localhost:8000/api/status");
      if (r.ok) setStatus(await r.json());
    } catch { /* backend may not be running in preview */ }
  }, []);

  const fetchAlertCount = useCallback(async () => {
    try {
      const r = await fetch("http://localhost:8000/api/alerts");
      if (r.ok) {
        const data = await r.json();
        setAlertCount(data.filter(a => !a.is_read).length);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchAlertCount();
    const iv = setInterval(() => { fetchStatus(); fetchAlertCount(); }, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus, fetchAlertCount]);

  const handleLocationChange = async (loc) => {
    setSelectedLoc(loc);
    setLocationOpen(false);
    try {
      await fetch("http://localhost:8000/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loc),
      });
    } catch {}
  };

  const loopRunning = status?.loop_running ?? false;

  return (
    <div className="app-shell">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">🌾</div>
          <div className="brand-text">
            <span className="brand-title">AgroSense</span>
            <span className="brand-sub">Intelligent Agent System</span>
          </div>
        </div>

        <div className="agent-pulse-row">
          <span className={`pulse-dot ${loopRunning ? "active" : "inactive"}`} />
          <span className="pulse-label">
            {loopRunning ? "Agents running" : "Agents offline"}
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.id === "alerts" && alertCount > 0 && (
                <span className="badge">{alertCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Location selector */}
        <div className="location-picker">
          <p className="location-label">📍 Active Region</p>
          <button className="location-btn" onClick={() => setLocationOpen(o => !o)}>
            {selectedLoc.name} <span className="chevron">{locationOpen ? "▲" : "▼"}</span>
          </button>
          {locationOpen && (
            <div className="location-dropdown">
              {GHANA_LOCATIONS.map(loc => (
                <button
                  key={loc.name}
                  className={`location-option ${loc.name === selectedLoc.name ? "selected" : ""}`}
                  onClick={() => handleLocationChange(loc)}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <p className="footer-course">DCIT 403 · University of Ghana</p>
          <p className="footer-name">Aggrey Paintsil Ishmeal</p>
          <p className="footer-id">ID: 11125864</p>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="main-content">
        <header className="top-bar">
          <h1 className="page-title">
            {NAV_ITEMS.find(n => n.id === page)?.icon}{" "}
            {NAV_ITEMS.find(n => n.id === page)?.label}
          </h1>
          <div className="top-bar-right">
            <div className="agent-status-pills">
              {status && Object.entries(status.agents)
                .filter(([k]) => k.endsWith("_agent"))
                .map(([key, val]) => (
                  <span key={key} className={`status-pill ${val.status}`}>
                    {key.replace("_agent", "").replace("_", " ")}
                    <span className="pill-dot" />
                  </span>
                ))}
            </div>
          </div>
        </header>

        <div className="page-body">
          {page === "dashboard" && <Dashboard selectedLoc={selectedLoc} />}
          {page === "agents"    && <AgentMonitor status={status} />}
          {page === "history"   && <History />}
          {page === "alerts"    && <Alerts onRead={fetchAlertCount} />}
        </div>
      </main>
    </div>
  );
}

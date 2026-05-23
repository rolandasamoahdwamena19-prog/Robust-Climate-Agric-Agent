import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

const DEMO_EVENTS = [
  { id:7, timestamp: new Date().toISOString(), agent:"RecommendationAgent", event_type:"recommend",       message:"Top crop: Rice (92% confidence)", severity:"info" },
  { id:6, timestamp: new Date(Date.now()-5000).toISOString(), agent:"SoilAgent", event_type:"process_success", message:"pH=6.1  Moisture=52.0%", severity:"info" },
  { id:5, timestamp: new Date(Date.now()-8000).toISOString(), agent:"WeatherAgent", event_type:"perceive_success", message:"Temp=29.4°C  Humidity=72%", severity:"info" },
  { id:4, timestamp: new Date(Date.now()-60000).toISOString(), agent:"System", event_type:"loop_complete", message:"Cycle complete → Rice recommended", severity:"info" },
  { id:3, timestamp: new Date(Date.now()-62000).toISOString(), agent:"SoilAgent", event_type:"process_success", message:"pH=6.2  Moisture=50.0%", severity:"info" },
  { id:2, timestamp: new Date(Date.now()-65000).toISOString(), agent:"WeatherAgent", event_type:"perceive_success", message:"Temp=29.1°C  Humidity=70%", severity:"info" },
  { id:1, timestamp: new Date(Date.now()-120000).toISOString(), agent:"System", event_type:"loop_cycle", message:"Agent cycle starting — location: Accra, Ghana", severity:"info" },
];

const DEMO_STATUS = {
  loop_running: true,
  agents: {
    weather_agent: { status:"ready", last_run: new Date(Date.now()-5000).toISOString(), cycles:12 },
    soil_agent:    { status:"ready", last_run: new Date(Date.now()-4000).toISOString(), cycles:12 },
    recommendation_agent: { status:"ready", last_run: new Date(Date.now()-3000).toISOString(), cycles:12 },
  },
  location: { name:"Accra, Ghana", lat:5.6037, lon:-0.1870 }
};

export default function AgentMonitor({ status: propStatus }) {
  const [events, setEvents]   = useState([]);
  const [status, setStatus]   = useState(propStatus || null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick]       = useState(0);

  const fetchEvents = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/events?limit=40`);
      if (r.ok) setEvents(await r.json());
      const s = await fetch(`${API}/api/status`);
      if (s.ok) setStatus(await s.json());
    } catch {
      setEvents(DEMO_EVENTS);
      setStatus(DEMO_STATUS);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => {
    const iv = setInterval(() => { fetchEvents(); setTick(t => t+1); }, 4000);
    return () => clearInterval(iv);
  }, [fetchEvents]);

  const agents = status?.agents || {};
  const loopRunning = status?.loop_running ?? false;

  // Determine which agent is currently "active" for animation
  const activeAgent = Object.entries(agents)
    .find(([, v]) => v.status !== "ready" && v.status !== "idle")?.[0] || null;

  const timeSince = (ts) => {
    if (!ts) return "never";
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff/60)}m ${diff%60}s ago`;
  };

  return (
    <div className="fade-in">
      {/* ── AGENT LOOP VISUALISATION ── */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <p className="card-title" style={{ marginBottom:0 }}>🔄 Perceive → Decide → Act Loop</p>
          <span className={`tag ${loopRunning ? "tag-green" : "tag-red"}`}>
            {loopRunning ? "● Running" : "○ Stopped"}
          </span>
        </div>

        <div className="agent-loop-diagram">
          <LoopNode
            icon="🌡️" label="Perceive" sublabel="Weather Agent"
            state={agents.weather_agent?.status || "idle"}
            active={activeAgent === "weather_agent" || (loopRunning && tick % 3 === 0)}
            cycles={agents.weather_agent?.cycles || 0}
            lastRun={agents.weather_agent?.last_run}
            timeSince={timeSince}
          />
          <div className="loop-arrow">→</div>
          <LoopNode
            icon="🌱" label="Decide" sublabel="Soil Agent"
            state={agents.soil_agent?.status || "idle"}
            active={activeAgent === "soil_agent" || (loopRunning && tick % 3 === 1)}
            cycles={agents.soil_agent?.cycles || 0}
            lastRun={agents.soil_agent?.last_run}
            timeSince={timeSince}
          />
          <div className="loop-arrow">→</div>
          <LoopNode
            icon="🧠" label="Act" sublabel="Recommendation Agent"
            state={agents.recommendation_agent?.status || "idle"}
            active={activeAgent === "recommendation_agent" || (loopRunning && tick % 3 === 2)}
            cycles={agents.recommendation_agent?.cycles || 0}
            lastRun={agents.recommendation_agent?.last_run}
            timeSince={timeSince}
          />
          <div className="loop-arrow" style={{ transform:"rotate(180deg)", color:"var(--harvest)" }}>→</div>
          <LoopNode
            icon="🌍" label="Environment" sublabel="Open-Meteo API"
            state="ready"
            active={false}
            cycles={null}
            lastRun={null}
            timeSince={timeSince}
          />
        </div>

        <div style={{
          background:"var(--surface-2)", borderRadius:"var(--r-sm)",
          padding:"12px 16px", marginTop:16, fontSize:12.5,
          color:"var(--text-soft)", lineHeight:1.8
        }}>
          <strong style={{ color:"var(--forest)" }}>Prometheus Design Mapping:</strong><br/>
          The loop runs autonomously every 60 seconds. <strong>Weather Agent</strong> (perceives) fetches live 
          temperature, humidity, rainfall, and soil moisture from Open-Meteo. <strong>Soil Agent</strong> (decides) 
          derives soil pH using environmental heuristics and raises alerts on threshold crossings. 
          <strong> Recommendation Agent</strong> (acts) applies ranked decision rules and reactively 
          re-evaluates when conditions change by more than 2°C or 10% moisture.
        </div>
      </div>

      {/* ── AGENT DESCRIPTORS ── */}
      <div className="grid-3" style={{ marginBottom:20, gap:16 }}>
        <AgentCard
          name="Weather Agent"
          icon="🌡️"
          role="Data Acquisition"
          responsibilities={["Fetch live weather from Open-Meteo", "Report temperature & humidity", "Provide soil moisture readings", "Run every 60s autonomously"]}
          data={["Temperature (°C)", "Humidity (%)", "Soil moisture (%)", "Wind speed, Rainfall"]}
          status={agents.weather_agent?.status || "idle"}
          cycles={agents.weather_agent?.cycles || 0}
        />
        <AgentCard
          name="Soil Agent"
          icon="🌱"
          role="Soil Data Management"
          responsibilities={["Derive soil pH from conditions", "Validate moisture levels", "Raise drought/flood alerts", "Accept manual pH overrides"]}
          data={["Soil moisture (%)", "Soil pH (4.5–8.0)", "Alert thresholds"]}
          status={agents.soil_agent?.status || "idle"}
          cycles={agents.soil_agent?.cycles || 0}
        />
        <AgentCard
          name="Recommendation Agent"
          icon="🧠"
          role="Decision-Making"
          responsibilities={["Evaluate all crop rules", "Rank by suitability score", "Detect condition changes", "Output top recommendation"]}
          data={["Decision rules (5 crops)", "Confidence scores", "Condition snapshots"]}
          status={agents.recommendation_agent?.status || "idle"}
          cycles={agents.recommendation_agent?.cycles || 0}
        />
      </div>

      {/* ── AGENT PROPERTIES (Prometheus) ── */}
      <div className="card" style={{ marginBottom:20 }}>
        <p className="card-title">📋 Agent Properties — Prometheus Methodology</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Weather Agent</th>
              <th>Soil Agent</th>
              <th>Recommendation Agent</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Autonomy",      "Polls API independently on schedule", "Derives data without user input", "Generates recommendations without prompting"],
              ["Reactiveness",  "Re-fetches on location change", "Alerts on threshold crossings", "Re-evaluates on condition delta > threshold"],
              ["Proactiveness", "Initiates each agent cycle", "Proactively validates ranges", "Continuously updates crop ranking"],
              ["Beliefs",       "Current weather state", "Soil moisture, derived pH", "All environmental data combined"],
              ["Capabilities",  "API communication, data parsing", "pH derivation, alert generation", "Rule evaluation, crop ranking"],
              ["Actions",       "Fetch weather data", "Store soil state, raise alerts", "Output recommendation, persist to DB"],
            ].map(([prop, ...vals]) => (
              <tr key={prop}>
                <td style={{ fontWeight:600, color:"var(--forest)" }}>{prop}</td>
                {vals.map((v,i) => <td key={i} style={{ fontSize:12.5 }}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── LIVE EVENT LOG ── */}
      <div className="card">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <p className="card-title" style={{ marginBottom:0 }}>📡 Live Agent Event Log</p>
          <span style={{ fontSize:11, color:"var(--text-muted)" }}>
            Refreshes every 4s
          </span>
        </div>
        {loading ? (
          <div className="spinner" style={{ margin:"20px auto" }} />
        ) : events.length === 0 ? (
          <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", padding:"20px 0" }}>
            No events yet — agent cycle starting…
          </p>
        ) : (
          <div style={{ maxHeight: 340, overflowY:"auto" }}>
            {events.map(ev => (
              <div key={ev.id} className={`event-row event-severity-${ev.severity}`}>
                <span className="event-time">
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" })}
                </span>
                <span className={`event-agent ${ev.agent}`}>{ev.agent.replace("Agent","")}</span>
                <span className="event-msg">
                  <span style={{ color:"var(--text-muted)", marginRight:6, fontSize:11 }}>{ev.event_type}</span>
                  {ev.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoopNode({ icon, label, sublabel, state, active, cycles, lastRun, timeSince }) {
  return (
    <div className={`loop-node ${active ? "active" : ""}`} style={{ minWidth:110 }}>
      <span className="loop-node-icon">{icon}</span>
      <span className="loop-node-label">{label}</span>
      <span className="loop-node-state">{sublabel}</span>
      <span className={`tag ${
        state === "ready" ? "tag-green" :
        state === "perceiving" || state === "processing" || state === "deciding" ? "tag-amber" :
        state === "error" ? "tag-red" : "tag-blue"
      }`} style={{ fontSize:10, marginTop:4 }}>{state}</span>
      {cycles != null && (
        <span style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>
          {cycles} cycles
        </span>
      )}
      {lastRun && (
        <span style={{ fontSize:9, color:"var(--text-muted)" }}>
          {timeSince(lastRun)}
        </span>
      )}
    </div>
  );
}

function AgentCard({ name, icon, role, responsibilities, data, status, cycles }) {
  const statusColor = {
    ready: "#27ae60", idle: "#95a5a6", error: "#e74c3c",
    perceiving: "#e67e22", processing: "#e67e22", deciding: "#8e44ad"
  }[status] || "#95a5a6";

  return (
    <div className="card" style={{ padding:18 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <span style={{ fontSize:28 }}>{icon}</span>
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontSize:15, color:"var(--forest)" }}>{name}</div>
          <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.5px" }}>{role}</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <span className="tag tag-green" style={{ fontSize:10 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:statusColor, display:"inline-block" }} />
          {status}
        </span>
        <span style={{ fontSize:11, color:"var(--text-muted)" }}>{cycles} cycles run</span>
      </div>
      <div style={{ marginBottom:10 }}>
        <p style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.7px", marginBottom:5 }}>Responsibilities</p>
        {responsibilities.map(r => (
          <div key={r} style={{ fontSize:12, color:"var(--text-mid)", marginBottom:3, display:"flex", gap:6 }}>
            <span style={{ color:"var(--leaf)", flexShrink:0 }}>✓</span>{r}
          </div>
        ))}
      </div>
      <div>
        <p style={{ fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.7px", marginBottom:5 }}>Data (Beliefs)</p>
        {data.map(d => (
          <span key={d} style={{
            display:"inline-block", background:"var(--surface-2)", border:"1px solid var(--border)",
            borderRadius:4, padding:"2px 8px", fontSize:11, marginRight:4, marginBottom:4,
            color:"var(--text-mid)"
          }}>{d}</span>
        ))}
      </div>
    </div>
  );
}

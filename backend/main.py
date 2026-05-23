"""
Multi-Agent Intelligent System for Climate-Resilient Agriculture
DCIT 403 - Aggrey Paintsil Ishmeal (11125864)

Implements Prometheus methodology with:
- Autonomous agent loop (proactiveness)
- Reactive environmental monitoring (reactiveness)  
- Continuous operation without manual triggers (autonomy)

Uses Open-Meteo API (completely free, no API key required)
"""

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sqlite3
import httpx
import asyncio
import json
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# DATABASE SETUP
# ─────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect("agri_agent.db")
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS environmental_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            location TEXT,
            temperature REAL,
            humidity REAL,
            soil_moisture REAL,
            soil_ph REAL,
            wind_speed REAL,
            rainfall REAL,
            source TEXT DEFAULT 'auto'
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            crop TEXT,
            confidence REAL,
            reasoning TEXT,
            conditions TEXT,
            triggered_by TEXT DEFAULT 'autonomous'
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS agent_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            agent TEXT,
            event_type TEXT,
            message TEXT,
            severity TEXT DEFAULT 'info'
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            alert_type TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialised")


def get_db():
    conn = sqlite3.connect("agri_agent.db")
    conn.row_factory = sqlite3.Row
    return conn


# ─────────────────────────────────────────────
# AGENT STATE  (shared across agents)
# ─────────────────────────────────────────────

agent_state = {
    "weather_agent": {"status": "idle", "last_run": None, "cycles": 0},
    "soil_agent":    {"status": "idle", "last_run": None, "cycles": 0},
    "recommendation_agent": {"status": "idle", "last_run": None, "cycles": 0},
    "loop_running": False,
    "current_location": {"name": "Accra, Ghana", "lat": 5.6037, "lon": -0.1870},
    "last_recommendation": None,
    "previous_conditions": None,
}

# ─────────────────────────────────────────────
# WEATHER AGENT  — perceives real-world data
# ─────────────────────────────────────────────

class WeatherAgent:
    """
    Autonomous agent responsible for fetching real-time weather data.
    Uses Open-Meteo (free, no API key).
    Proactively polls on a schedule AND reacts to location changes.
    """

    async def perceive(self, lat: float, lon: float) -> dict | None:
        """Fetch live weather from Open-Meteo API (free, no key required)."""
        agent_state["weather_agent"]["status"] = "perceiving"
        log_event("WeatherAgent", "perceive", f"Fetching weather for {lat},{lon}")

        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
            "&hourly=soil_moisture_0_to_1cm"
            "&forecast_days=1"
        )
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

            current = data.get("current", {})
            hourly  = data.get("hourly", {})

            # Soil moisture from first hourly reading (0–1 cm layer, 0–1 scale → convert to %)
            raw_sm = hourly.get("soil_moisture_0_to_1cm", [None])[0]
            soil_moisture_pct = round(raw_sm * 100, 1) if raw_sm is not None else 35.0

            result = {
                "temperature": current.get("temperature_2m", 28.0),
                "humidity":    current.get("relative_humidity_2m", 65.0),
                "wind_speed":  current.get("wind_speed_10m", 5.0),
                "rainfall":    current.get("precipitation", 0.0),
                "soil_moisture": soil_moisture_pct,
                "timestamp":   datetime.now().isoformat(),
                "source":      "open-meteo-live",
            }
            agent_state["weather_agent"]["status"] = "ready"
            agent_state["weather_agent"]["last_run"] = datetime.now().isoformat()
            agent_state["weather_agent"]["cycles"] += 1
            log_event("WeatherAgent", "perceive_success",
                      f"Temp={result['temperature']}°C  Humidity={result['humidity']}%")
            return result

        except Exception as e:
            agent_state["weather_agent"]["status"] = "error"
            log_event("WeatherAgent", "error", str(e), severity="error")
            logger.error(f"WeatherAgent error: {e}")
            return None


# ─────────────────────────────────────────────
# SOIL AGENT  — manages soil belief state
# ─────────────────────────────────────────────

class SoilAgent:
    """
    Responsible for soil data.  
    Derives soil_ph from moisture & temperature heuristic when not manually provided.
    Reacts to moisture threshold crossings to trigger alerts.
    """

    # Typical Ghanaian soil pH range: 5.5–7.0
    BASE_PH = 6.2

    def process(self, weather_data: dict, manual_ph: float | None = None) -> dict:
        agent_state["soil_agent"]["status"] = "processing"
        log_event("SoilAgent", "process", "Deriving soil conditions")

        moisture = weather_data.get("soil_moisture", 35.0)
        temp     = weather_data.get("temperature", 28.0)
        rainfall = weather_data.get("rainfall", 0.0)

        # Heuristic: higher rainfall slightly lowers pH (leaching), warmth raises it
        ph = manual_ph if manual_ph is not None else round(
            self.BASE_PH - (rainfall * 0.02) + (temp - 28) * 0.01, 2
        )
        ph = max(4.5, min(8.0, ph))   # clamp to realistic range

        # Reactive: alert if critically dry or waterlogged
        if moisture < 20:
            create_alert("drought_risk",
                         f"⚠️ Soil moisture critically low ({moisture}%) — irrigation advised")
        elif moisture > 80:
            create_alert("waterlog_risk",
                         f"⚠️ Soil moisture very high ({moisture}%) — drainage advised")

        result = {
            "soil_moisture": moisture,
            "soil_ph":       ph,
            "derived":       manual_ph is None,
        }
        agent_state["soil_agent"]["status"] = "ready"
        agent_state["soil_agent"]["last_run"] = datetime.now().isoformat()
        agent_state["soil_agent"]["cycles"]  += 1
        log_event("SoilAgent", "process_success", f"pH={ph}  Moisture={moisture}%")
        return result


# ─────────────────────────────────────────────
# RECOMMENDATION AGENT  — core decision-maker
# ─────────────────────────────────────────────

CROP_RULES = [
    {
        "crop": "Rice",
        "emoji": "🌾",
        "conditions": lambda t, m, ph, h: t > 28 and m > 55 and 5.5 <= ph <= 7.0,
        "reasoning": "High temperature with abundant soil moisture and suitable pH ideal for paddy rice",
        "base_confidence": 0.92,
    },
    {
        "crop": "Maize",
        "emoji": "🌽",
        "conditions": lambda t, m, ph, h: t > 24 and 30 <= m <= 70 and ph >= 5.8,
        "reasoning": "Warm climate with moderate moisture matches maize growth requirements",
        "base_confidence": 0.88,
    },
    {
        "crop": "Cocoa",
        "emoji": "🍫",
        "conditions": lambda t, m, ph, h: 22 <= t <= 30 and m > 40 and h > 70 and 6.0 <= ph <= 7.5,
        "reasoning": "Moderate temperatures with high humidity and good moisture suit cocoa",
        "base_confidence": 0.85,
    },
    {
        "crop": "Yam",
        "emoji": "🥔",
        "conditions": lambda t, m, ph, h: t > 25 and 35 <= m <= 65 and 5.5 <= ph <= 7.5,
        "reasoning": "Warm conditions with moderate soil moisture match yam cultivation",
        "base_confidence": 0.82,
    },
    {
        "crop": "Groundnut",
        "emoji": "🥜",
        "conditions": lambda t, m, ph, h: t > 26 and m < 50 and 5.8 <= ph <= 7.0,
        "reasoning": "Warm and slightly dry conditions with near-neutral pH suit groundnuts",
        "base_confidence": 0.80,
    },
    {
        "crop": "Cassava",
        "emoji": "🌿",
        "conditions": lambda t, m, ph, h: True,   # default fallback
        "reasoning": "Cassava is drought-tolerant and grows across a wide range of Ghanaian conditions",
        "base_confidence": 0.70,
    },
]


class RecommendationAgent:
    """
    Core decision-making agent.
    - Proactively generates recommendations every cycle.
    - Reactively detects condition changes and re-evaluates.
    - Ranks all applicable crops by confidence.
    """

    def decide(self, weather: dict, soil: dict) -> dict:
        agent_state["recommendation_agent"]["status"] = "deciding"
        log_event("RecommendationAgent", "decide", "Evaluating crop suitability")

        t  = weather.get("temperature",    28.0)
        h  = weather.get("humidity",       65.0)
        m  = soil.get("soil_moisture",     40.0)
        ph = soil.get("soil_ph",           6.2)
        rf = weather.get("rainfall",       0.0)

        # Score all crops
        ranked = []
        for rule in CROP_RULES:
            try:
                match = rule["conditions"](t, m, ph, h)
            except Exception:
                match = False
            if match:
                # Adjust confidence slightly by how well conditions fit
                moisture_bonus = 0.02 if 35 <= m <= 65 else 0.0
                rain_bonus     = 0.01 if rf > 0 else 0.0
                conf = min(0.99, rule["base_confidence"] + moisture_bonus + rain_bonus)
                ranked.append({
                    "crop":       rule["crop"],
                    "emoji":      rule["emoji"],
                    "confidence": round(conf, 3),
                    "reasoning":  rule["reasoning"],
                })

        ranked.sort(key=lambda x: x["confidence"], reverse=True)
        top = ranked[0] if ranked else {
            "crop": "Cassava", "emoji": "🌿",
            "confidence": 0.70,
            "reasoning": "Default recommendation — cassava is highly resilient",
        }

        # Detect reactive condition change
        prev = agent_state.get("previous_conditions")
        triggered_by = "autonomous_cycle"
        if prev:
            delta_t = abs(t - prev.get("temperature", t))
            delta_m = abs(m - prev.get("soil_moisture", m))
            if delta_t > 2 or delta_m > 10:
                triggered_by = "condition_change"
                log_event("RecommendationAgent", "reactive_trigger",
                          f"Δtemp={delta_t:.1f}°C  Δmoisture={delta_m:.1f}% — re-evaluating",
                          severity="warning")
                create_alert("condition_change",
                             f"🔄 Conditions changed (Δtemp {delta_t:.1f}°C, Δmoisture {delta_m:.1f}%) — recommendation updated")

        agent_state["previous_conditions"] = {"temperature": t, "soil_moisture": m}

        result = {
            "top_recommendation": top,
            "all_crops":          ranked,
            "conditions_snapshot": {
                "temperature":   t,
                "humidity":      h,
                "soil_moisture": m,
                "soil_ph":       ph,
                "rainfall":      rf,
            },
            "triggered_by": triggered_by,
            "timestamp":    datetime.now().isoformat(),
        }
        agent_state["recommendation_agent"]["status"] = "ready"
        agent_state["recommendation_agent"]["last_run"] = datetime.now().isoformat()
        agent_state["recommendation_agent"]["cycles"]  += 1
        agent_state["last_recommendation"] = result
        log_event("RecommendationAgent", "recommend",
                  f"Top crop: {top['crop']} ({top['confidence']*100:.0f}% confidence)")
        return result


# ─────────────────────────────────────────────
# AUTONOMOUS AGENT LOOP
# ─────────────────────────────────────────────

weather_agent        = WeatherAgent()
soil_agent           = SoilAgent()
recommendation_agent = RecommendationAgent()


async def autonomous_agent_loop():
    """
    The Perceive → Decide → Act loop running continuously in the background.
    This is what makes the system AUTONOMOUS and PROACTIVE — it doesn't wait
    for user input to generate and store recommendations.
    """
    logger.info("🤖 Autonomous agent loop started")
    agent_state["loop_running"] = True

    while agent_state["loop_running"]:
        try:
            loc = agent_state["current_location"]
            log_event("System", "loop_cycle", f"Agent cycle starting — location: {loc['name']}")

            # PERCEIVE — Weather Agent fetches live data
            weather_data = await weather_agent.perceive(loc["lat"], loc["lon"])
            if weather_data is None:
                logger.warning("Weather data unavailable, skipping cycle")
                await asyncio.sleep(60)
                continue

            # DECIDE — Soil Agent derives soil state
            soil_data = soil_agent.process(weather_data)

            # ACT — Recommendation Agent makes decision
            recommendation = recommendation_agent.decide(weather_data, soil_data)

            # Persist to DB
            db = get_db()
            db.execute("""
                INSERT INTO environmental_data
                (timestamp, location, temperature, humidity, soil_moisture, soil_ph,
                 wind_speed, rainfall, source)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                weather_data["timestamp"],
                loc["name"],
                weather_data["temperature"],
                weather_data["humidity"],
                soil_data["soil_moisture"],
                soil_data["soil_ph"],
                weather_data["wind_speed"],
                weather_data["rainfall"],
                weather_data["source"],
            ))
            top = recommendation["top_recommendation"]
            db.execute("""
                INSERT INTO recommendations
                (timestamp, crop, confidence, reasoning, conditions, triggered_by)
                VALUES (?,?,?,?,?,?)
            """, (
                recommendation["timestamp"],
                top["crop"],
                top["confidence"],
                top["reasoning"],
                json.dumps(recommendation["conditions_snapshot"]),
                recommendation["triggered_by"],
            ))
            db.commit()
            db.close()

            log_event("System", "loop_complete",
                      f"Cycle complete → {top['crop']} recommended")

        except Exception as e:
            logger.error(f"Agent loop error: {e}")
            log_event("System", "loop_error", str(e), severity="error")

        # Wait 60 seconds before next autonomous cycle
        await asyncio.sleep(60)


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def log_event(agent: str, event_type: str, message: str, severity: str = "info"):
    try:
        db = get_db()
        db.execute(
            "INSERT INTO agent_events (timestamp, agent, event_type, message, severity) VALUES (?,?,?,?,?)",
            (datetime.now().isoformat(), agent, event_type, message, severity),
        )
        db.commit()
        db.close()
    except Exception:
        pass


def create_alert(alert_type: str, message: str):
    try:
        db = get_db()
        db.execute(
            "INSERT INTO alerts (timestamp, alert_type, message) VALUES (?,?,?)",
            (datetime.now().isoformat(), alert_type, message),
        )
        db.commit()
        db.close()
    except Exception:
        pass


# ─────────────────────────────────────────────
# APP LIFECYCLE
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(autonomous_agent_loop())
    yield
    agent_state["loop_running"] = False
    task.cancel()


app = FastAPI(title="Climate-Resilient Agriculture Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    """Agent system status — used by frontend to show live agent state."""
    return {
        "agents":       agent_state,
        "loop_running": agent_state["loop_running"],
        "location":     agent_state["current_location"],
        "timestamp":    datetime.now().isoformat(),
    }


@app.post("/api/location")
async def set_location(body: dict):
    """
    REACTIVE: Changing location triggers an immediate agent cycle.
    The weather agent is proactively re-queried for the new location.
    """
    name = body.get("name", "Accra, Ghana")
    lat  = float(body.get("lat", 5.6037))
    lon  = float(body.get("lon", -0.1870))
    agent_state["current_location"] = {"name": name, "lat": lat, "lon": lon}
    log_event("System", "location_change",
              f"Location updated to {name} — triggering immediate cycle", severity="warning")

    # Immediate reactive cycle
    weather_data = await weather_agent.perceive(lat, lon)
    if weather_data:
        soil_data    = soil_agent.process(weather_data)
        recommendation = recommendation_agent.decide(weather_data, soil_data)
        db = get_db()
        db.execute("""
            INSERT INTO environmental_data
            (timestamp, location, temperature, humidity, soil_moisture, soil_ph, wind_speed, rainfall, source)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (
            weather_data["timestamp"], name,
            weather_data["temperature"], weather_data["humidity"],
            soil_data["soil_moisture"], soil_data["soil_ph"],
            weather_data["wind_speed"], weather_data["rainfall"],
            weather_data["source"],
        ))
        top = recommendation["top_recommendation"]
        db.execute("""
            INSERT INTO recommendations (timestamp, crop, confidence, reasoning, conditions, triggered_by)
            VALUES (?,?,?,?,?,?)
        """, (
            recommendation["timestamp"], top["crop"], top["confidence"],
            top["reasoning"], json.dumps(recommendation["conditions_snapshot"]),
            "location_change",
        ))
        db.commit()
        db.close()
        return {"status": "ok", "recommendation": recommendation}
    return {"status": "error", "message": "Weather data unavailable"}


@app.post("/api/soil/manual")
async def manual_soil_input(body: dict):
    """
    Allows user to provide manual soil pH.
    REACTIVE: triggers immediate re-evaluation by recommendation agent.
    """
    ph = float(body.get("soil_ph", 6.2))
    loc = agent_state["current_location"]
    weather_data = await weather_agent.perceive(loc["lat"], loc["lon"])
    if not weather_data:
        return {"status": "error", "message": "Could not fetch weather data"}

    soil_data    = soil_agent.process(weather_data, manual_ph=ph)
    recommendation = recommendation_agent.decide(weather_data, soil_data)

    db = get_db()
    db.execute("""
        INSERT INTO environmental_data
        (timestamp, location, temperature, humidity, soil_moisture, soil_ph, wind_speed, rainfall, source)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (
        weather_data["timestamp"], loc["name"],
        weather_data["temperature"], weather_data["humidity"],
        soil_data["soil_moisture"], soil_data["soil_ph"],
        weather_data["wind_speed"], weather_data["rainfall"],
        "manual_soil",
    ))
    top = recommendation["top_recommendation"]
    db.execute("""
        INSERT INTO recommendations (timestamp, crop, confidence, reasoning, conditions, triggered_by)
        VALUES (?,?,?,?,?,?)
    """, (
        recommendation["timestamp"], top["crop"], top["confidence"],
        top["reasoning"], json.dumps(recommendation["conditions_snapshot"]),
        "manual_soil_input",
    ))
    db.commit()
    db.close()
    return {"status": "ok", "recommendation": recommendation}


@app.get("/api/recommendation/current")
def get_current_recommendation():
    """Latest recommendation from the autonomous agent."""
    rec = agent_state.get("last_recommendation")
    if rec:
        return rec
    db = get_db()
    row = db.execute(
        "SELECT * FROM recommendations ORDER BY timestamp DESC LIMIT 1"
    ).fetchone()
    db.close()
    if row:
        return {
            "top_recommendation": {
                "crop": row["crop"], "confidence": row["confidence"],
                "reasoning": row["reasoning"],
            },
            "conditions_snapshot": json.loads(row["conditions"] or "{}"),
            "triggered_by": row["triggered_by"],
            "timestamp": row["timestamp"],
        }
    return {"message": "No recommendation yet — agent cycle in progress"}


@app.get("/api/recommendations/history")
def get_recommendations_history(limit: int = 20):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM recommendations ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.get("/api/environment/history")
def get_environment_history(limit: int = 24):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM environmental_data ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.get("/api/events")
def get_events(limit: int = 30):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM agent_events ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.get("/api/alerts")
def get_alerts():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 20"
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.post("/api/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int):
    db = get_db()
    db.execute("UPDATE alerts SET is_read=1 WHERE id=?", (alert_id,))
    db.commit()
    db.close()
    return {"status": "ok"}


@app.get("/api/weather/current")
async def get_current_weather():
    """Force an immediate weather perception — used by frontend refresh button."""
    loc = agent_state["current_location"]
    data = await weather_agent.perceive(loc["lat"], loc["lon"])
    if data:
        return data
    return JSONResponse(status_code=503, content={"error": "Weather service unavailable"})

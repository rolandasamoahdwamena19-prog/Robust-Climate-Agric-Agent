"""
simulation.py — AgroSense Agent Simulation
DCIT 403 | Aggrey Paintsil Ishmeal (11125864)

Run this standalone script to demonstrate the Perceive→Decide→Act loop
in the terminal WITHOUT needing the frontend or a live internet connection.

Usage:
    python3 simulation.py

The simulation:
  1. Runs 5 agent cycles with randomised (but realistic) environmental data
  2. Demonstrates REACTIVE behaviour by injecting a drought condition on cycle 3
  3. Demonstrates PROACTIVE behaviour by showing crops are ranked every cycle
  4. Prints a clear log showing which agent is doing what, and why
"""

import time
import random
import json
from datetime import datetime


# ─────────────────────────────────────────────────────────────────────────────
# ANSI colours for readable terminal output
# ─────────────────────────────────────────────────────────────────────────────
R = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
CYAN = "\033[96m"
RED = "\033[91m"
GREY = "\033[90m"
GOLD = "\033[33m"

def hdr(text):   print(f"\n{BOLD}{CYAN}{'─'*60}{R}\n{BOLD}{CYAN}  {text}{R}\n{CYAN}{'─'*60}{R}")
def agent(name, msg, colour=BLUE): print(f"  {colour}{BOLD}[{name}]{R} {msg}")
def info(msg):   print(f"  {GREY}{msg}{R}")
def alert(msg):  print(f"  {RED}{BOLD}⚠  ALERT:{R} {RED}{msg}{R}")
def ok(msg):     print(f"  {GREEN}✓ {msg}{R}")
def sep():       print(f"  {GREY}{'·'*50}{R}")


# ─────────────────────────────────────────────────────────────────────────────
# DECISION RULES  (same as main.py — duplicated so simulation runs standalone)
# ─────────────────────────────────────────────────────────────────────────────
CROP_RULES = [
    {"crop": "Rice",      "emoji": "🌾",
     "cond": lambda t,m,ph,h: t > 28 and m > 55 and 5.5 <= ph <= 7.0,
     "reason": "High temperature with abundant soil moisture → paddy rice",
     "base_conf": 0.92},
    {"crop": "Maize",     "emoji": "🌽",
     "cond": lambda t,m,ph,h: t > 24 and 30 <= m <= 70 and ph >= 5.8,
     "reason": "Warm climate with moderate moisture → maize",
     "base_conf": 0.88},
    {"crop": "Cocoa",     "emoji": "🍫",
     "cond": lambda t,m,ph,h: 22 <= t <= 30 and m > 40 and h > 70 and 6.0 <= ph <= 7.5,
     "reason": "Moderate temperature + high humidity + moisture → cocoa",
     "base_conf": 0.85},
    {"crop": "Yam",       "emoji": "🥔",
     "cond": lambda t,m,ph,h: t > 25 and 35 <= m <= 65 and 5.5 <= ph <= 7.5,
     "reason": "Warm conditions with moderate soil moisture → yam",
     "base_conf": 0.82},
    {"crop": "Groundnut", "emoji": "🥜",
     "cond": lambda t,m,ph,h: t > 26 and m < 50 and 5.8 <= ph <= 7.0,
     "reason": "Warm + slightly dry + near-neutral pH → groundnut",
     "base_conf": 0.80},
    {"crop": "Cassava",   "emoji": "🌿",
     "cond": lambda t,m,ph,h: True,
     "reason": "Drought-tolerant fallback crop (wide condition tolerance)",
     "base_conf": 0.70},
]


# ─────────────────────────────────────────────────────────────────────────────
# SIMULATED WEATHER AGENT
# ─────────────────────────────────────────────────────────────────────────────
class SimWeatherAgent:
    """
    In simulation mode, generates realistic Ghanaian weather readings
    instead of calling the Open-Meteo API.  Behaviour is identical to the
    real WeatherAgent — this is purely for offline demonstration.
    """

    def __init__(self):
        self.cycles = 0

    def perceive(self, scenario: dict | None = None) -> dict:
        agent("WeatherAgent", "Perceiving environment…", BLUE)
        time.sleep(0.4)

        if scenario:
            data = scenario
            info(f"Scenario override applied: {scenario}")
        else:
            data = {
                "temperature":    round(random.uniform(26, 33), 1),
                "humidity":       round(random.uniform(60, 82), 1),
                "wind_speed":     round(random.uniform(4, 14), 1),
                "rainfall":       round(random.uniform(0, 4) if random.random() > 0.6 else 0, 1),
                "soil_moisture":  round(random.uniform(30, 70), 1),
            }

        data["timestamp"] = datetime.now().isoformat()
        data["source"] = "simulation"
        self.cycles += 1

        agent("WeatherAgent",
              f"Perceived → temp={data['temperature']}°C  "
              f"humidity={data['humidity']}%  "
              f"soil_moisture={data['soil_moisture']}%  "
              f"rainfall={data['rainfall']}mm", BLUE)
        return data


# ─────────────────────────────────────────────────────────────────────────────
# SIMULATED SOIL AGENT
# ─────────────────────────────────────────────────────────────────────────────
class SimSoilAgent:
    """
    Derives soil pH from weather percepts and raises reactive alerts
    when moisture crosses critical thresholds.
    """

    BASE_PH = 6.2
    DROUGHT_THRESHOLD   = 20   # %
    WATERLOG_THRESHOLD  = 80   # %

    def __init__(self):
        self.cycles = 0

    def process(self, weather: dict, manual_ph: float | None = None) -> dict:
        agent("SoilAgent", "Processing soil conditions…", YELLOW)
        time.sleep(0.3)

        moisture  = weather["soil_moisture"]
        temp      = weather["temperature"]
        rainfall  = weather["rainfall"]

        ph = manual_ph if manual_ph is not None else round(
            self.BASE_PH - (rainfall * 0.02) + (temp - 28) * 0.01, 2
        )
        ph = max(4.5, min(8.0, ph))

        # REACTIVE: threshold alerts
        if moisture < self.DROUGHT_THRESHOLD:
            alert(f"Soil moisture critically low ({moisture}%) — irrigation advised!")
        elif moisture > self.WATERLOG_THRESHOLD:
            alert(f"Soil moisture dangerously high ({moisture}%) — drainage advised!")
        else:
            ok(f"Soil moisture normal ({moisture}%)")

        self.cycles += 1
        agent("SoilAgent",
              f"Derived → soil_pH={ph}  moisture={moisture}%"
              + (" [manual override]" if manual_ph else " [derived from conditions]"),
              YELLOW)
        return {"soil_moisture": moisture, "soil_ph": ph}


# ─────────────────────────────────────────────────────────────────────────────
# SIMULATED RECOMMENDATION AGENT
# ─────────────────────────────────────────────────────────────────────────────
class SimRecommendationAgent:
    """
    Core decision-making agent.  Evaluates all crop rules, ranks them,
    and reacts to significant condition changes between cycles.
    """

    def __init__(self):
        self.cycles = 0
        self.prev_conditions = None

    def decide(self, weather: dict, soil: dict) -> dict:
        agent("RecommendationAgent", "Evaluating crop suitability…", GREEN)
        time.sleep(0.4)

        t  = weather["temperature"]
        h  = weather["humidity"]
        m  = soil["soil_moisture"]
        ph = soil["soil_ph"]
        rf = weather["rainfall"]

        # Check for reactive trigger
        triggered_by = "autonomous_cycle"
        if self.prev_conditions:
            delta_t = abs(t - self.prev_conditions["temperature"])
            delta_m = abs(m - self.prev_conditions["soil_moisture"])
            if delta_t > 2 or delta_m > 10:
                triggered_by = "condition_change"
                agent("RecommendationAgent",
                      f"REACTIVE: conditions changed "
                      f"(Δtemp={delta_t:.1f}°C  Δmoisture={delta_m:.1f}%) — re-evaluating",
                      RED)

        self.prev_conditions = {"temperature": t, "soil_moisture": m}

        # Evaluate all rules
        ranked = []
        for rule in CROP_RULES:
            if rule["cond"](t, m, ph, h):
                conf = min(0.99, rule["base_conf"] + (0.02 if 35 <= m <= 65 else 0))
                ranked.append({
                    "crop": rule["crop"], "emoji": rule["emoji"],
                    "confidence": round(conf, 3), "reason": rule["reason"]
                })
        ranked.sort(key=lambda x: x["confidence"], reverse=True)
        top = ranked[0]

        self.cycles += 1
        return {"top": top, "all": ranked, "triggered_by": triggered_by}


# ─────────────────────────────────────────────────────────────────────────────
# MAIN SIMULATION LOOP
# ─────────────────────────────────────────────────────────────────────────────
def run_simulation():
    print(f"""
{BOLD}{GOLD}╔══════════════════════════════════════════════════════════╗
║   AgroSense — Multi-Agent System Simulation              ║
║   DCIT 403 · University of Ghana                         ║
║   Aggrey Paintsil Ishmeal · ID: 11125864                 ║
╚══════════════════════════════════════════════════════════╝{R}

{GREY}This simulation demonstrates the Prometheus Perceive→Decide→Act loop
across 5 cycles, including reactive and proactive agent behaviours.{R}
""")

    weather_agent        = SimWeatherAgent()
    soil_agent           = SimSoilAgent()
    recommendation_agent = SimRecommendationAgent()

    # Scenarios: None = random, dict = forced for demonstration
    scenarios = [
        None,                                     # Cycle 1 — normal autonomous
        None,                                     # Cycle 2 — normal autonomous
        {"temperature": 29.0, "humidity": 65.0,   # Cycle 3 — DROUGHT REACTIVE TRIGGER
         "wind_speed": 12.0, "rainfall": 0.0,
         "soil_moisture": 17.0},
        {"temperature": 34.0, "humidity": 80.0,   # Cycle 4 — HOT & MOIST, tests Rice rule
         "wind_speed": 6.0,  "rainfall": 3.5,
         "soil_moisture": 62.0},
        None,                                     # Cycle 5 — normal autonomous
    ]

    for cycle_num, scenario in enumerate(scenarios, 1):
        hdr(f"CYCLE {cycle_num} / {len(scenarios)}  —  {datetime.now().strftime('%H:%M:%S')}")

        print(f"  {GREY}Prometheus Phase 5 — Perceive → Decide → Act loop iteration{R}\n")

        # ── PERCEIVE ──
        print(f"  {BOLD}[ PERCEIVE ]{R}  Weather Agent fetches environment data")
        weather = weather_agent.perceive(scenario)
        sep()

        # ── DECIDE ──
        print(f"\n  {BOLD}[ DECIDE  ]{R}  Soil Agent derives soil state")
        soil = soil_agent.process(weather)
        sep()

        # ── ACT ──
        print(f"\n  {BOLD}[ ACT     ]{R}  Recommendation Agent evaluates crops")
        result = recommendation_agent.decide(weather, soil)

        top = result["top"]
        print(f"\n  {BOLD}{GOLD}TOP RECOMMENDATION:{R}  "
              f"{top['emoji']} {BOLD}{top['crop']}{R}  "
              f"({int(top['confidence']*100)}% confidence)")
        print(f"  {GREY}Reason: {top['reason']}{R}")

        if len(result["all"]) > 1:
            print(f"\n  {GREY}Full ranking:{R}")
            for i, c in enumerate(result["all"]):
                bar = "█" * int(c["confidence"] * 20)
                print(f"  {GREY}{i+1}. {c['emoji']} {c['crop']:12s} {bar:20s} "
                      f"{int(c['confidence']*100)}%{R}")

        print(f"\n  {GREY}Triggered by: {result['triggered_by']}{R}")
        print(f"  {GREY}Agent cycles — Weather:{weather_agent.cycles}  "
              f"Soil:{soil_agent.cycles}  "
              f"Recommendation:{recommendation_agent.cycles}{R}")

        if cycle_num < len(scenarios):
            print(f"\n  {GREY}⟳ Next cycle in 2 seconds (real system: 60s)…{R}")
            time.sleep(2)

    # ── SUMMARY ──
    hdr("SIMULATION COMPLETE")
    print(f"""
  {BOLD}Prometheus Properties Demonstrated:{R}

  {GREEN}✓ Autonomy{R}
    The loop ran {len(scenarios)} complete cycles without any user interaction.
    Each agent acted independently on its own schedule.

  {GREEN}✓ Reactiveness{R}
    Cycle 3 injected drought conditions (moisture = 17%).
    The Soil Agent immediately raised an alert.
    The Recommendation Agent detected the condition change
    and re-evaluated with trigger = 'condition_change'.

  {GREEN}✓ Proactiveness{R}
    Every cycle, the Recommendation Agent proactively ranked
    ALL applicable crops — not just the top one — and updated
    its internal state for the next comparison.

  {BOLD}Agent Communication (Acquaintance Diagram):{R}
    WeatherAgent ──→ RecommendationAgent
    SoilAgent    ──→ RecommendationAgent

  {BOLD}Technology Stack:{R}
    Backend:  FastAPI + SQLite + asyncio background task
    Frontend: React + Vite + IBM Plex Sans / Playfair Display
    Weather:  Open-Meteo API (free, no key required)
""")


if __name__ == "__main__":
    run_simulation()

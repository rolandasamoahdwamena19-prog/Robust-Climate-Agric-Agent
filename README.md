# AgroSense — Multi-Agent Intelligent System for Climate-Resilient Agriculture
**DCIT 403 · University of Ghana · Aggrey Paintsil Ishmeal (ID: 11125864)**

---

## PHASE 1 — System Specification

### Problem Description

**What problem are you solving?**
Agricultural productivity in Ghana is significantly affected by climate variability — irregular rainfall, temperature shifts, and poor soil management lead to low crop yields and inefficient resource use. Farmers, particularly smallholders, lack access to real-time decision support tools that translate environmental data into actionable crop advice.

**Why is an agent appropriate?**
An intelligent agent is appropriate because the problem requires:
- Continuous perception of a dynamic, partially observable environment (weather changes, soil conditions)
- Autonomous decision-making without constant human intervention
- Reactiveness to sudden environmental changes (drought onset, temperature spikes)
- Proactive goal-directed behaviour (continuously evaluating crop suitability even when no one is watching)

A static rule-based script or a manual lookup table cannot satisfy these requirements. An agent can.

**Stakeholders:**
1. Farmers (primary users — receive crop recommendations)
2. Agricultural extension officers (monitor trends, review recommendations)
3. Policy makers and planners (use aggregated historical data)

---

### Goal Specification

**Top-Level Goal:**
Provide intelligent, autonomous crop recommendations based on real-time environmental conditions.

**Sub-Goals (ranked by priority):**
1. Acquire real-time weather data without manual input
2. Derive and validate soil conditions from environmental readings
3. Analyse combined environmental data against crop suitability rules
4. Generate and rank crop recommendations by confidence score
5. React immediately when environmental conditions change significantly
6. Store all environmental data and recommendation history for trend analysis
7. Alert stakeholders when critical thresholds are crossed (drought, waterlogging)

---

### Functionalities

What the system can do (not how):
1. Retrieve live weather data automatically for any Ghanaian location
2. Derive soil pH from environmental conditions or accept manual override
3. Evaluate the suitability of 6 crops against current conditions
4. Rank all suitable crops by confidence score and output the top recommendation
5. Detect meaningful changes in environmental conditions and update recommendations
6. Raise alerts when soil moisture crosses critical thresholds
7. Display environmental trends and recommendation history visually
8. Operate continuously without requiring user input

---

### Scenarios

**Scenario 1 — Autonomous Crop Selection (normal conditions)**
A farmer in Accra has no time to check conditions manually. The system runs in the background, fetches live weather at 6am, derives soil pH as 6.1, and recommends Rice with 92% confidence. The farmer opens the dashboard and sees the recommendation waiting — no input required.

**Scenario 2 — Drought Reactive Response**
At midday, soil moisture drops to 17% (below the 20% threshold). The Soil Agent immediately raises a drought alert. The Recommendation Agent detects the 28% moisture delta from the previous cycle, marks the trigger as condition_change, and shifts the top recommendation from Maize to Groundnut — a more drought-tolerant crop.

**Scenario 3 — Location Change**
An extension officer switches the active region from Accra to Tamale. The system immediately triggers a fresh agent cycle for Tamale's coordinates, fetches new weather data, and updates the recommendation. The transition is seamless and takes under 3 seconds.

**Scenario 4 — Manual Soil pH Override**
A farmer who has had their soil professionally tested enters a pH reading of 5.2 (more acidic than derived). The Soil Agent accepts the override, the Recommendation Agent re-evaluates all rules against the new pH, and the crop ranking updates immediately.

**Scenario 5 — Monitoring Trends**
An agricultural officer reviews the Field History page and notices that soil moisture has been steadily declining over the past 12 cycles. Three drought alerts appear in the Alerts page. They use this data to plan an irrigation intervention.

---

### Environment Description

**Environment type:** Dynamic (conditions change continuously), Partially Observable (soil pH is derived, not directly measured)

**Percepts (what the agent perceives):**
1. Temperature (degrees C) from Open-Meteo API
2. Relative Humidity (%) from Open-Meteo API
3. Soil Moisture (%) from Open-Meteo hourly soil layer data
4. Rainfall / Precipitation (mm) from Open-Meteo API
5. Wind Speed (km/h) from Open-Meteo API
6. Soil pH — derived by Soil Agent or provided manually by user

**Actions (what the agent acts upon):**
1. Fetch weather data from external API
2. Derive soil pH from environmental conditions
3. Store environmental readings in the database
4. Generate and rank crop recommendations
5. Raise drought or waterlogging alerts
6. Log all agent events for audit and monitoring
7. Update the recommendation displayed to the user

**How it affects its environment:**
The agent influences farmer behaviour through recommendations and alerts, which indirectly affect planting decisions, irrigation choices, and resource allocation.

---

## PHASE 2 — Architectural Design

### Agent Types

Three agents — justified by separation of concerns:

| Agent | Role | Justification |
|---|---|---|
| WeatherAgent | Data acquisition | Isolates external API dependency; replaceable without affecting decision logic |
| SoilAgent | Soil data management | Specialised soil knowledge and threshold logic kept separate from weather |
| RecommendationAgent | Decision-making | Single point of reasoning; receives clean data from both other agents |

A single-agent design would violate separation of concerns — mixing API calls, soil derivation, and decision logic in one class makes each harder to test, maintain, and explain.

### Why Multiple Agents

1. Separation of concerns — each agent has one clear responsibility
2. Improved scalability — adding a new sensor type means adding a new agent, not modifying existing ones
3. Easier maintenance — bugs in weather fetching do not affect recommendation logic
4. Better modular design — agents can be tested and reasoned about independently

### Grouping Functionalities

| Functionality | Assigned Agent | Reason |
|---|---|---|
| Fetch live weather | WeatherAgent | External I/O belongs with the perception agent |
| Derive soil pH | SoilAgent | Specialised domain knowledge |
| Threshold alerts | SoilAgent | Soil state crosses thresholds — most appropriate to raise |
| Crop rule evaluation | RecommendationAgent | Core reasoning logic centralised here |
| Confidence ranking | RecommendationAgent | Decision output responsibility |
| Reactive re-evaluation | RecommendationAgent | Detects its own condition deltas |

### Acquaintance Diagram

```
WeatherAgent ──(weather_data)──> RecommendationAgent
SoilAgent    ──(soil_data)────> RecommendationAgent
```

Both WeatherAgent and SoilAgent send data to the RecommendationAgent. Neither communicates with the other directly. The RecommendationAgent outputs to the environment (user/database).

### Agent Descriptors

**WeatherAgent**
- Responsibility: Perceive live environmental data from Open-Meteo API
- Goals handled: Sub-goal 1 (acquire weather data)
- Data used: latitude, longitude to temperature, humidity, wind_speed, rainfall, soil_moisture
- Interactions: Sends weather dict to RecommendationAgent each cycle

**SoilAgent**
- Responsibility: Derive soil state; raise threshold alerts
- Goals handled: Sub-goals 2, 7 (soil conditions, alerts)
- Data used: weather percepts to soil_moisture, soil_ph
- Interactions: Sends soil dict to RecommendationAgent; creates alerts in database

**RecommendationAgent**
- Responsibility: Core decision-making and crop ranking
- Goals handled: Sub-goals 3, 4, 5 (analyse, recommend, react)
- Data used: Combined weather and soil data; previous_conditions belief state
- Interactions: Receives from both agents; writes recommendations to database

---

## PHASE 3 — Interaction Design

### Interaction Diagram (Message Sequence)

```
Timer/Event  --> System:             Trigger cycle (every 60s or on event)
System       --> WeatherAgent:       perceive(lat, lon)
WeatherAgent --> Open-Meteo API:     HTTP GET weather forecast
Open-Meteo   --> WeatherAgent:       JSON weather response
WeatherAgent --> RecommendationAgent: weather_data dict
System       --> SoilAgent:          process(weather_data)
SoilAgent    --> RecommendationAgent: soil_data dict
RecommendationAgent --> Database:    INSERT recommendation
RecommendationAgent --> System:      recommendation dict
System       --> User:               Display result on dashboard
```

### Message Structure

**weather_data (WeatherAgent to RecommendationAgent):**
- temperature: float (degrees C)
- humidity: float (%)
- wind_speed: float (km/h)
- rainfall: float (mm)
- soil_moisture: float (%)
- timestamp: string (ISO 8601)
- source: string ("open-meteo-live" or "simulation")

**soil_data (SoilAgent to RecommendationAgent):**
- soil_moisture: float (%)
- soil_ph: float (4.5 to 8.0)
- derived: boolean (True if pH was derived, False if manual override)

---

## PHASE 4 — Detailed Design

### Capabilities

**WeatherAgent:** perceive(lat, lon) — triggered every 60s by autonomous loop, or immediately on location change event. Falls back gracefully if API is unavailable.

**SoilAgent:** process(weather_data, manual_ph) — triggered after every WeatherAgent perception. Monitors thresholds and raises alerts. Derives pH using heuristic: BASE_PH minus (rainfall times 0.02) plus (temp minus 28) times 0.01.

**RecommendationAgent:** decide(weather, soil) — triggered after SoilAgent. Compares current vs previous_conditions belief. Evaluates all 6 crop rules and ranks by confidence.

### Plans

**Primary plan:**
1. WeatherAgent fetches live data
2. SoilAgent derives soil state
3. RecommendationAgent evaluates CROP_RULES in priority order
4. All matching crops ranked by confidence; top crop returned

**Decision Rules (ranked):**
```
IF temperature > 28 AND soil_moisture > 55 AND 5.5 <= pH <= 7.0  --> Rice      (92%)
IF temperature > 24 AND 30 <= moisture <= 70 AND pH >= 5.8        --> Maize     (88%)
IF 22 <= temp <= 30 AND moisture > 40 AND humidity > 70           --> Cocoa     (85%)
IF temperature > 25 AND 35 <= moisture <= 65                      --> Yam       (82%)
IF temperature > 26 AND moisture < 50 AND 5.8 <= pH <= 7.0       --> Groundnut (80%)
ELSE (always true)                                                --> Cassava   (70%)
```

**Alternative plan — weather API unavailable:**
Loop logs the error, skips the cycle, retries after 60 seconds.

**Alternative plan — manual soil pH provided:**
SoilAgent bypasses derivation heuristic and uses the provided value, then triggers immediate re-evaluation.

### Data Description (Beliefs)

agent_state dict (in-memory, shared across all agents):
- weather_agent.status: current operational state
- weather_agent.cycles: number of completed perception cycles
- previous_conditions: last known temperature and moisture (for reactive delta detection)
- last_recommendation: most recent recommendation output
- current_location: active lat/lon for weather queries

Database (persistent beliefs):
- environmental_data: full history of all perceived conditions
- recommendations: full history of all crop recommendations with trigger reason
- agent_events: complete audit log of all agent actions
- alerts: all threshold-crossing events with read/unread status

### Percepts and Actions

**All Percepts:**
1. Temperature (degrees C)
2. Relative Humidity (%)
3. Soil Moisture (%)
4. Rainfall (mm)
5. Wind Speed (km/h)
6. Soil pH (derived or manual)
7. Location change event
8. Manual pH input event

**All Actions:**
1. Fetch weather data from Open-Meteo API
2. Derive soil pH from environmental conditions
3. Raise drought alert when moisture below 20%
4. Raise waterlogging alert when moisture above 80%
5. Evaluate crop suitability rules
6. Generate ranked crop recommendation
7. Store environmental reading in database
8. Store recommendation in database
9. Log agent event to audit table
10. Update agent status in shared state

---

## PHASE 5 — Implementation

### Prototype Description

The system implements the Prometheus agent loop as an asyncio background task (autonomous_agent_loop) that starts automatically when the FastAPI server boots. It runs indefinitely, executing a full Perceive-Decide-Act cycle every 60 seconds with no user input required.

Three reactive triggers interrupt the autonomous cycle on demand:
- /api/location POST triggers an immediate cycle for new coordinates
- /api/soil/manual POST triggers immediate re-evaluation with user-provided pH
- Condition delta exceeding threshold causes RecommendationAgent to flag condition_change

### Platform and Language — Justification

| Component | Choice | Justification |
|---|---|---|
| Python 3.11 | Backend language | Native asyncio for the autonomous loop; clean class-based agents |
| FastAPI | Web framework | Lightweight, async-native, auto-generates API docs at /docs |
| SQLite | Database | Zero-configuration; built into Python stdlib; no setup needed |
| React + Vite | Frontend | Component model maps naturally to per-agent UI panels |
| Open-Meteo API | Weather data | Completely free, no registration, no API key required |
| asyncio background task | Autonomous loop | Built into Python stdlib; no extra dependencies needed |

### Mapping to Prometheus Design

| Prometheus Phase | Implementation |
|---|---|
| Phase 1 — Percepts | WeatherAgent.perceive() returns temperature, humidity, soil_moisture, rainfall, wind_speed |
| Phase 1 — Actions | create_alert(), log_event(), decide(), database INSERT calls |
| Phase 2 — Agent types | class WeatherAgent, class SoilAgent, class RecommendationAgent in main.py |
| Phase 2 — Acquaintance | weather_data and soil_data dicts passed into RecommendationAgent.decide() |
| Phase 3 — Interaction | autonomous_agent_loop() orchestrates the message sequence each cycle |
| Phase 3 — Message structure | Typed dicts with timestamp, source, and domain values |
| Phase 4 — Capabilities | Agent class methods; triggered by loop timer or event endpoints |
| Phase 4 — Plans | CROP_RULES list of lambda functions evaluated in priority order |
| Phase 4 — Beliefs | agent_state dict (in-memory) and SQLite tables (persistent) |
| Phase 5 — Loop | autonomous_agent_loop() as asyncio.create_task() in lifespan handler |

### Challenges and Limitations

**Challenges encountered:**
1. Making the loop truly autonomous required asyncio background tasks rather than simple request-response handlers — this was the key architectural shift from the original manual-only version
2. Open-Meteo returns soil moisture on a 0-1 scale (volumetric fraction) not a percentage — required conversion by multiplying raw value by 100
3. Reactive delta detection required storing previous_conditions in shared agent state rather than local variables so it persisted across cycles

**Limitations:**
1. Rule-based system — crop rules are hand-coded thresholds, not learned from data. A machine learning model trained on Ghanaian agricultural yield data would be more accurate
2. Soil pH is derived from a simple heuristic, not measured directly. Real IoT soil sensors would remove this approximation
3. Only 6 crops are evaluated. Expanding to the full range of Ghanaian crops would require more rules and variables
4. No real-time IoT sensor integration — soil data comes from the API topsoil moisture layer or manual user input

---

## Setup Guide

### Requirements
- Python 3.11 or higher
- Node.js 18 or higher

### Run the simulation (no installs, no internet needed)
```bash
cd agri-agent/backend
python3 simulation.py
```

### Run the full system

Terminal 1 — Backend:
```bash
cd agri-agent/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Terminal 2 — Frontend:
```bash
cd agri-agent/frontend
npm install
npm run dev
```
Open http://localhost:3000

API documentation auto-generated by FastAPI at: http://localhost:8000/docs

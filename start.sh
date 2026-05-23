#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# AgroSense — Start Script
# DCIT 403 | Aggrey Paintsil Ishmeal (11125864)
# ─────────────────────────────────────────────────────────────────────────────

set -e

GOLD='\033[33m'
GREEN='\033[92m'
CYAN='\033[96m'
GREY='\033[90m'
BOLD='\033[1m'
R='\033[0m'

echo -e "\n${BOLD}${GOLD}╔══════════════════════════════════════════════════════════╗"
echo -e "║   AgroSense — Climate-Resilient Agriculture Agent       ║"
echo -e "║   DCIT 403 · University of Ghana                        ║"
echo -e "╚══════════════════════════════════════════════════════════╝${R}\n"

# ── Check Python ──────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "Python 3 is required. Install it from https://python.org"
    exit 1
fi

# ── Check Node ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "Node.js is required. Install it from https://nodejs.org"
    exit 1
fi

MODE=${1:-full}

if [ "$MODE" = "sim" ] || [ "$MODE" = "simulation" ]; then
    echo -e "${CYAN}Running standalone simulation (no internet required)...${R}\n"
    cd backend
    python3 simulation.py
    exit 0
fi

# ── Backend ───────────────────────────────────────────────────────────────────
echo -e "${CYAN}[1/3] Installing Python dependencies...${R}"
cd backend
pip install -r requirements.txt -q

echo -e "${CYAN}[2/3] Starting backend (FastAPI + autonomous agent loop)...${R}"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend running on http://localhost:8000${R}"
echo -e "${GREY}  PID: $BACKEND_PID${R}"

sleep 2

# ── Frontend ──────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}[3/3] Installing & starting frontend...${R}"
cd ../frontend
npm install -q
echo -e "${GREEN}✓ Frontend starting on http://localhost:3000${R}"

echo -e "\n${BOLD}System is running!${R}"
echo -e "  ${GREEN}Dashboard:${R}      http://localhost:3000"
echo -e "  ${GREEN}API docs:${R}       http://localhost:8000/docs"
echo -e "  ${GREY}Press Ctrl+C to stop both servers${R}\n"

# Run frontend in foreground (Ctrl+C kills both via trap)
trap "kill $BACKEND_PID 2>/dev/null; exit" INT TERM
npm run dev

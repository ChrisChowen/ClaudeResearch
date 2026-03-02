#!/bin/bash
# ─────────────────────────────────────────────────
# Study 1: First Encounters with Vibe-Coding
# Double-click this file to launch the session setup
# ─────────────────────────────────────────────────

# Navigate to the project directory (where this script lives)
cd "$(dirname "$0")"

# Check Node.js is installed
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is not installed."
  echo "   Install it from https://nodejs.org/ (v18 or later)"
  echo ""
  echo "Press any key to close..."
  read -n 1
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (first run only)..."
  npm install
  echo ""
fi

echo "🚀 Starting Session Setup..."
echo "   The dashboard will open in your browser automatically."
echo "   To stop: close this window or press Ctrl+C"
echo ""

npm start

#!/usr/bin/env bash
# Samsung Smart TV Web Remote - Linux / macOS / Raspberry Pi Launcher

cd "$(dirname "$0")"

echo "======================================================"
echo "  Starting Samsung Smart TV Web Remote..."
echo "======================================================"

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js (v18+) to run."
    exit 1
fi

node server.js

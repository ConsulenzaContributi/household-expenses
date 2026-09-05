#!/bin/bash
# Doppio clic su questo file per aprire l'app "Spese di casa".
cd "$(dirname "$0")" || exit 1
python3 server.py

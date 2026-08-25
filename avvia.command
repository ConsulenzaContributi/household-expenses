#!/bin/bash
# Doppio clic su questo file per aprire l'app "Spese di casa".
cd "$(dirname "$0")" || exit 1
PORTA=8791
while lsof -i :$PORTA >/dev/null 2>&1; do PORTA=$((PORTA+1)); done
echo ""
echo "  🏠  Spese di casa"
echo "  ─────────────────────────────────────────────"
echo "  App avviata su http://localhost:$PORTA"
echo "  Lascia aperta questa finestra mentre la usi."
echo "  Per chiudere: premi Ctrl+C oppure chiudi la finestra."
echo ""
( sleep 1; open "http://localhost:$PORTA" ) &
python3 server.py $PORTA

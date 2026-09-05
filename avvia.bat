@echo off
REM Doppio clic su questo file per aprire l'app "Spese di casa".
REM Serve Python 3 installato (da python.org, spuntando "Add python.exe to PATH").
cd /d "%~dp0"
py -3 server.py 2>nul || python server.py
pause

@echo off
title MarketSpider GLOBAL - 24/7 Watchdog

:loop
echo ========================================================
echo Iniciando Spider Global (Manejando Cola H3)
echo Fecha y hora: %date% %time%
echo ========================================================
.venv\Scripts\python.exe spider_global.py

echo.
echo [!] El spider ha terminado o colapsado.
echo [!] Reiniciando proceso en 15 segundos...
timeout /t 15

goto loop

@echo off
title ELiSecureChat Service Controller
cls
echo ===================================================
echo             ELiSecureChat Controller           
echo ===================================================
echo.
echo Checking port 3000 status...
netstat -ano | findstr :3000 > nul
if %errorlevel% equ 0 (
    echo [STATUS] ELiSecureChat Backend is currently RUNNING.
    echo.
    echo 1. Stop ELiSecureChat Services
    echo 2. Restart ELiSecureChat Services
    echo 3. Exit
    echo.
    set /p choice="Select an option (1-3): "
    if "%choice%"=="1" goto stop
    if "%choice%"=="2" goto restart
    if "%choice%"=="3" exit
) else (
    echo [STATUS] ELiSecureChat Services are currently STOPPED.
    echo.
    echo 1. Start ELiSecureChat Services
    echo 2. Exit
    echo.
    set /p choice="Select an option (1-2): "
    if "%choice%"=="1" goto start
    if "%choice%"=="2" exit
)

:start
echo.
echo Starting backend, web frontend and admin panel...
start cmd /k "npm run dev"
echo.
echo Services launched!
echo - Backend: http://localhost:3000
echo - User Chat App: http://localhost:5173
echo - Admin Panel: http://localhost:5174
echo.
pause
exit

:stop
echo.
echo Stopping all ELiSecureChat Node.js processes...
taskkill /f /im node.exe > nul 2>&1
echo Services stopped successfully.
echo.
pause
exit

:restart
echo.
echo Restarting services...
taskkill /f /im node.exe > nul 2>&1
timeout /t 2 > nul
start cmd /k "npm run dev"
echo Services restarted successfully.
echo.
pause
exit

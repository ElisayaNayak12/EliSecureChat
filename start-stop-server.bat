@echo off
setlocal EnableExtensions EnableDelayedExpansion
title EliSecureChat Controller

rem ---------------------------------------------------------------
rem  EliSecureChat start / stop / restart / status
rem  Double-click for the menu, or run with an argument:
rem     start-stop-server.bat start | stop | restart | status | open | phone
rem  "phone" = phone test mode: a free temporary https link that works on any phone.
rem ---------------------------------------------------------------

rem Always work from the folder this file lives in.
cd /d "%~dp0"

set "PIDFILE=%~dp0.dev-servers.pid"
set "PHONE_PIDS=%~dp0.phone-test.pids"
set "PHONE_URL_FILE=%~dp0.phone-test.url"
set "PORTS=3000 5173 5174"
set "INTERACTIVE=1"
if not "%~1"=="" set "INTERACTIVE=0"

call :check_tools || goto :end_error

if /i "%~1"=="start"   goto :start
if /i "%~1"=="stop"    goto :stop
if /i "%~1"=="restart" goto :restart
if /i "%~1"=="status"  ( call :status & call :print_status & goto :end )
if /i "%~1"=="open"    goto :open
if /i "%~1"=="phone"   goto :phone
if not "%~1"=="" (
    echo Unknown option "%~1". Use: start ^| stop ^| restart ^| status ^| open ^| phone
    goto :end_error
)

rem ======================= interactive menu =======================
:menu
cls
echo ===================================================
echo               EliSecureChat Controller
echo ===================================================
echo.
call :status
call :print_status
echo.
if "!PHONE!"=="1" (
    echo   1. Stop phone test mode
    echo   2. Copy the phone link again
    echo   3. Open the link on this PC
    echo   4. Exit
) else if "!RUNNING!"=="1" (
    echo   1. Stop all services
    echo   2. Restart all services
    echo   3. Open the chat app in the browser
    echo   4. Switch to phone test mode ^(secure link for your phone^)
    echo   5. Exit
) else (
    echo   1. Start all services
    echo   2. Phone test mode ^(secure link for your phone^)
    echo   3. Exit
)
echo.
set "choice="
set /p "choice=Select an option: "
if "!PHONE!"=="1" (
    if "!choice!"=="1" goto :stop
    if "!choice!"=="2" goto :phone_copy
    if "!choice!"=="3" goto :phone_open
    if "!choice!"=="4" goto :end
) else if "!RUNNING!"=="1" (
    if "!choice!"=="1" goto :stop
    if "!choice!"=="2" goto :restart
    if "!choice!"=="3" goto :open
    if "!choice!"=="4" goto :phone
    if "!choice!"=="5" goto :end
) else (
    if "!choice!"=="1" goto :start
    if "!choice!"=="2" goto :phone
    if "!choice!"=="3" goto :end
)
echo Invalid choice.
call :sleep 2
goto :menu

rem ============================ start ============================
:start
call :status
if "!RUNNING!"=="1" (
    echo Services are already running. Use "restart" to restart them.
    goto :end
)
if not exist "node_modules\" (
    echo First run: installing packages, this can take a few minutes...
    call npm install || ( echo [ERROR] npm install failed. & goto :end_error )
)
echo Starting backend, chat app and admin console in a new window...
rem Start through PowerShell so we can remember the process id and stop exactly this tree later.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','title EliSecureChat Dev Servers && npm run dev' -WorkingDirectory '%~dp0.' -PassThru; Set-Content -Path '%PIDFILE%' -Value $p.Id -Encoding ascii"
if errorlevel 1 ( echo [ERROR] Could not start the servers. & goto :end_error )

echo Waiting for the servers to come up (the first build takes about 30 seconds)...
set /a waited=0
:wait_loop
call :status
if "!UP_3000!!UP_5173!"=="11" goto :started
if !waited! geq 120 (
    echo [WARN] Still not ready after 120 seconds. Check the "EliSecureChat Dev Servers" window for errors.
    goto :end
)
call :sleep 3
set /a waited+=3
goto :wait_loop

:started
echo.
echo Services are running:
echo   - Chat app:      http://localhost:5173
echo   - Admin console: http://localhost:5174
echo   - Backend API:   http://localhost:3000
echo.
echo Password-reset codes (dev mode) are printed in the "EliSecureChat Dev Servers" window.
if "%INTERACTIVE%"=="1" start "" "http://localhost:5173"
goto :end

rem ============================ stop =============================
:stop
echo Stopping EliSecureChat services...
call :kill_all
call :sleep 2
call :status
if "!RUNNING!"=="1" (
    echo [WARN] Some services are still running:
    call :print_status
    goto :end_error
)
echo All services stopped.
goto :end

rem =========================== restart ===========================
:restart
call :stop_quiet
goto :start

:stop_quiet
call :kill_all
call :sleep 2
exit /b 0

rem ========================= phone test ==========================
rem Runs the hosted build on this PC behind a free Cloudflare tunnel (https link for any phone).
:phone
call :status
if "!RUNNING!"=="1" (
    echo Stopping the running services first ^(phone test mode uses the same data^)...
    call :stop_quiet
)
if not exist "node_modules\" (
    echo First run: installing packages, this can take a few minutes...
    call npm install || ( echo [ERROR] npm install failed. & goto :end_error )
)
set "_nobrowser="
if "%INTERACTIVE%"=="0" set "_nobrowser=-NoBrowser"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\phone-test.ps1" !_nobrowser!
if errorlevel 1 (
    echo [ERROR] Phone test mode did not start. Stopping anything it started...
    call :kill_all
    goto :end_error
)
echo.
echo Leave this running while you test. To stop: run this file again and choose "Stop phone test mode".
goto :end

:phone_copy
if exist "%PHONE_URL_FILE%" (
    set /p _url=<"%PHONE_URL_FILE%"
    echo !_url!| clip
    echo Copied: !_url!
)
goto :end

:phone_open
if exist "%PHONE_URL_FILE%" (
    set /p _url=<"%PHONE_URL_FILE%"
    start "" "!_url!"
)
goto :end

rem ============================ open =============================
:open
start "" "http://localhost:5173"
goto :end

rem ========================== helpers ============================
rem Stops only this project's processes: the window we started, every Node process tree running from this
rem folder (concurrently, vite, tsc --watch, node --watch), and anything still listening on our ports.
:kill_all
if exist "%PIDFILE%" (
    set /p DEVPID=<"%PIDFILE%"
    if defined DEVPID taskkill /pid !DEVPID! /t /f >nul 2>&1
    del "%PIDFILE%" >nul 2>&1
)
rem Phone test mode: its server window and the tunnel tool from this project's tools folder.
if exist "%PHONE_PIDS%" (
    for /f "usebackq delims=" %%I in ("%PHONE_PIDS%") do taskkill /pid %%I /t /f >nul 2>&1
    del "%PHONE_PIDS%" >nul 2>&1
)
del "%PHONE_URL_FILE%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$t = Join-Path '%~dp0' 'tools\cloudflared.exe'; Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Where-Object { $_.ExecutablePath -eq $t } | ForEach-Object { & taskkill.exe /pid $_.ProcessId /t /f 2>$null | Out-Null }"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = '%~dp0'; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains($root) -or $_.CommandLine -match '--watch\s+dist/main\.js') } | ForEach-Object { & taskkill.exe /pid $_.ProcessId /t /f 2>$null | Out-Null }"
for %%P in (%PORTS%) do (
    for /f "tokens=5" %%I in ('netstat -ano ^| findstr /c:":%%P " ^| findstr "LISTENING"') do (
        if not "%%I"=="0" taskkill /pid %%I /t /f >nul 2>&1
    )
)
exit /b 0

:check_tools
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on PATH. Install Node.js 20 or newer from https://nodejs.org
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found. Reinstall Node.js from https://nodejs.org
    exit /b 1
)
exit /b 0

rem Sets UP_3000 / UP_5173 / UP_5174 to 1 when something is LISTENING on that port, and RUNNING if any is up.
:status
set "RUNNING=0"
set "PHONE=0"
set "PHONE_URL="
if exist "%PHONE_URL_FILE%" (
    tasklist /fi "imagename eq cloudflared.exe" 2>nul | findstr /i "cloudflared.exe" >nul && (
        set "PHONE=1"
        set /p PHONE_URL=<"%PHONE_URL_FILE%"
    )
)
for %%P in (%PORTS%) do (
    set "UP_%%P=0"
    netstat -ano | findstr /c:":%%P " | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 (
        set "UP_%%P=1"
        set "RUNNING=1"
    )
)
exit /b 0

:print_status
if "!PHONE!"=="1" (
    echo   [RUNNING] Phone test mode
    echo.
    echo   Open on your phone:  !PHONE_URL!
    echo   Admin console:       !PHONE_URL!/admin/
    exit /b 0
)
call :line "Backend API   (3000)" !UP_3000!
call :line "Chat app      (5173)" !UP_5173!
call :line "Admin console (5174)" !UP_5174!
exit /b 0

:line
set "_label=%~1"
if "%~2"=="1" ( echo   [RUNNING] !_label! ) else ( echo   [STOPPED] !_label! )
exit /b 0

rem Sleep that also works when there is no keyboard (timeout fails without one).
:sleep
set /a _n=%~1+1
ping -n %_n% 127.0.0.1 >nul
exit /b 0

:end
if "%INTERACTIVE%"=="1" pause
endlocal
exit /b 0

:end_error
if "%INTERACTIVE%"=="1" pause
endlocal
exit /b 1

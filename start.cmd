@echo off
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Alien\runtime\node.exe" (set "PATH=%LOCALAPPDATA%\Alien\runtime;%PATH%")
set "ALIEN_ROOT=%~dp0"
if not defined ALIEN_DATA set "ALIEN_DATA=%LOCALAPPDATA%\Alien\data"
node scripts\supervisor.mjs
if errorlevel 1 pause

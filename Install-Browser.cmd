@echo off
setlocal
if exist "%LOCALAPPDATA%\Alien\runtime\node.exe" (set "PATH=%LOCALAPPDATA%\Alien\runtime;%PATH%")
set "PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\Alien\data\browsers"
cd /d "%~dp0"
node node_modules\@playwright\mcp\node_modules\playwright\cli.js install chromium
if errorlevel 1 pause
endlocal

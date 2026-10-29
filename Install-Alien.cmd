@echo off
setlocal
set "ALIEN_INSTALLER=%TEMP%\alien-install-%RANDOM%.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest 'https://raw.githubusercontent.com/austinchennn/alien/v0.1.0/scripts/install.ps1' -OutFile $env:ALIEN_INSTALLER; & $env:ALIEN_INSTALLER"
if errorlevel 1 pause
endlocal

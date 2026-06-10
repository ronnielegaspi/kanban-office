@echo off
setlocal
echo Installing Kanban Office (x64)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0app.zip' -DestinationPath ([Environment]::GetFolderPath('LocalApplicationData')+'\Kanban Office') -Force"
set "APPDIR=%LOCALAPPDATA%\Kanban Office\Kanban Office-win32-x64"
set "EXE=%APPDIR%\Kanban Office.exe"
echo Checking dependencies (Node.js + Claude Code CLI)...
where npm >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where claude >nul 2>nul || npm install -g @anthropic-ai/claude-code
echo Creating desktop shortcut...
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($w.SpecialFolders('Desktop')+'\Kanban Office.lnk'); $s.TargetPath='%EXE%'; $s.WorkingDirectory='%APPDIR%'; $s.IconLocation='%APPDIR%\resources\app\icon.ico,0'; $s.Save()"
echo.
echo Done. Run "claude" once in a terminal to sign in to your Claude account.
start "" "%EXE%"
endlocal

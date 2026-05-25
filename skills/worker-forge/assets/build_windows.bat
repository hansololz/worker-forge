@echo off
REM Build script for {{WORKER_DISPLAY_NAME}} ({{WORKER_NAME}}) on Windows.
REM
REM Produces a single-file .exe in this folder's dist\ subdirectory.
REM The .exe is named with the display name (e.g. "My Worker.exe"), not the slug.
REM Run this from the windows\ directory inside the workspace:
REM     cd path\to\workspaces\{{WORKER_NAME}}\windows
REM     build_windows.bat
REM
REM Requires Python 3.10+ on PATH.

setlocal enabledelayedexpansion
set WORKER_SLUG={{WORKER_NAME}}
set WORKER_DISPLAY_NAME={{WORKER_DISPLAY_NAME}}
set OS_DIR=%~dp0
set DIST_DIR=%OS_DIR%dist
set PYI_WORK=%OS_DIR%.pyinstaller

echo Creating venv...
python -m venv "%OS_DIR%.venv" || goto :error

echo Installing dependencies...
call "%OS_DIR%.venv\Scripts\activate.bat" || goto :error
python -m pip install --upgrade pip || goto :error
python -m pip install -r "%OS_DIR%requirements.txt" pyinstaller || goto :error

echo Building executable...
REM --onefile     : single binary
REM --noconsole   : add for GUI workers, omit for CLI workers
REM --add-data    : bundle the OS folder's resources\ subdirectory if present
REM --name        : the display name (quoted, may contain spaces) — drives the
REM                 final .exe filename so the recipient sees a human-readable
REM                 name in their downloads folder.
REM
REM The forge sets WORKER_GUI=1 at code-gen time if the worker has a GUI;
REM otherwise --noconsole is left off so the CLI worker can write to stdout.
set EXTRA_FLAGS=
if /I "%WORKER_GUI%"=="1" set EXTRA_FLAGS=%EXTRA_FLAGS% --noconsole
if exist "%OS_DIR%resources" (
    set EXTRA_FLAGS=%EXTRA_FLAGS% --add-data "%OS_DIR%resources;resources"
)
REM If the OS folder ships an icon at resources\icon.ico, embed it.
if exist "%OS_DIR%resources\icon.ico" (
    set EXTRA_FLAGS=%EXTRA_FLAGS% --icon "%OS_DIR%resources\icon.ico"
)

if exist "%PYI_WORK%" rmdir /S /Q "%PYI_WORK%"
mkdir "%PYI_WORK%"
pyinstaller --onefile --name "%WORKER_DISPLAY_NAME%" ^
    --distpath "%DIST_DIR%" --workpath "%PYI_WORK%\build" --specpath "%PYI_WORK%" ^
    %EXTRA_FLAGS% "%OS_DIR%main.py" || goto :error

echo.
echo Done. Artifact: %DIST_DIR%\%WORKER_DISPLAY_NAME%.exe
exit /b 0

:error
echo.
echo Build failed.
exit /b 1

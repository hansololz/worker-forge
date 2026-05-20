@echo off
REM ---------------------------------------------------------------------
REM build_windows.bat — produce a single-file Windows .exe for this worker.
REM
REM Requires Python 3.11+ on PATH. Install from https://python.org if not
REM already installed. Re-run this script after each edit to main.py.
REM
REM The output lands in dist\<worker-name>.exe (relative to the worker's
REM project root, not this build/ subfolder).
REM ---------------------------------------------------------------------

setlocal

REM Resolve the worker's project root (parent of this build/ folder).
pushd "%~dp0.."

REM Worker name = the project folder name.
for %%I in ("%CD%") do set "WORKER_NAME=%%~nxI"

echo.
echo === Building worker: %WORKER_NAME% (Windows) ===
echo.

if not exist ".venv\Scripts\python.exe" (
    echo Creating build venv...
    python -m venv .venv || goto :error
)

call .venv\Scripts\activate.bat || goto :error

echo Installing dependencies...
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt || goto :error
python -m pip install pyinstaller || goto :error

echo Running PyInstaller...
pyinstaller ^
    --onefile ^
    --console ^
    --name "%WORKER_NAME%" ^
    --distpath dist ^
    --workpath build\pyinstaller-work ^
    --specpath build\pyinstaller-work ^
    main.py || goto :error

echo.
echo === Done ===
echo Your worker is at: %CD%\dist\%WORKER_NAME%.exe
echo.
popd
pause
exit /b 0

:error
echo.
echo Build failed. See the messages above.
popd
pause
exit /b 1

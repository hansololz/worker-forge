@echo off
REM ---------------------------------------------------------------------
REM build_windows.bat — produce a single-file Windows .exe for this worker.
REM
REM This script lives in build/. It is invoked from the worker folder
REM (its parent) — `build\build_windows.bat` from cmd, or by double-click
REM after right-click → Run from inside build/.
REM
REM Requires Python 3.11+ on PATH. Install from https://python.org if not
REM already installed. Re-run after each edit to main.py.
REM
REM Output lands in dist\<worker-name>.exe.
REM ---------------------------------------------------------------------

setlocal

REM Resolve the worker folder (parent of this script) and cd into it.
set "WORKER_DIR=%~dp0.."
pushd "%WORKER_DIR%" || exit /b 1

REM Worker name = folder name.
for %%I in ("%CD%") do set "WORKER_NAME=%%~nxI"

echo.
echo === Building worker: %WORKER_NAME% (target: windows) ===
echo.

if not exist "build\.venv\Scripts\python.exe" (
    echo Creating build venv at build\.venv ...
    python -m venv build\.venv || goto :error
)

call build\.venv\Scripts\activate.bat || goto :error

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

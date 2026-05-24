@echo off
REM Build script for {{WORKER_NAME}} on Windows.
REM
REM Produces a single-file .exe in the parent workspace's dist\ folder.
REM Run this from the build\ directory inside the workspace:
REM     cd path\to\workspaces\{{WORKER_NAME}}\build
REM     build_windows.bat
REM
REM Requires Python 3.10+ on PATH.

setlocal enabledelayedexpansion
set WORKER_NAME={{WORKER_NAME}}
set BUILD_DIR=%~dp0
set DIST_DIR=%BUILD_DIR%..\dist

echo Creating venv...
python -m venv "%BUILD_DIR%.venv" || goto :error

echo Installing dependencies...
call "%BUILD_DIR%.venv\Scripts\activate.bat" || goto :error
python -m pip install --upgrade pip || goto :error
python -m pip install -r "%BUILD_DIR%requirements.txt" pyinstaller || goto :error

echo Building executable...
REM --onefile     : single binary
REM --noconsole   : add for GUI workers, omit for CLI workers
REM --add-data    : bundle the workspace's resources\ folder if present
REM
REM The forge sets WORKER_GUI=1 at code-gen time if the worker has a GUI;
REM otherwise --noconsole is left off so the CLI worker can write to stdout.
set EXTRA_FLAGS=
if /I "%WORKER_GUI%"=="1" set EXTRA_FLAGS=%EXTRA_FLAGS% --noconsole
if exist "%BUILD_DIR%..\resources" (
    set EXTRA_FLAGS=%EXTRA_FLAGS% --add-data "%BUILD_DIR%..\resources;resources"
)
REM If the workspace ships an icon at resources\icon.ico, embed it.
if exist "%BUILD_DIR%..\resources\icon.ico" (
    set EXTRA_FLAGS=%EXTRA_FLAGS% --icon "%BUILD_DIR%..\resources\icon.ico"
)
pyinstaller --onefile --name %WORKER_NAME% %EXTRA_FLAGS% "%BUILD_DIR%main.py" || goto :error

echo Copying artifact to dist...
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
copy /Y "%BUILD_DIR%dist\%WORKER_NAME%.exe" "%DIST_DIR%\%WORKER_NAME%.exe" || goto :error

echo.
echo Done. Artifact: %DIST_DIR%\%WORKER_NAME%.exe
exit /b 0

:error
echo.
echo Build failed.
exit /b 1

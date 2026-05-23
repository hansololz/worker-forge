@echo off
REM Ensure Ollama is installed and the models this worker needs are pulled.
REM Copied into a workshop's resources\ folder when the user agreed to bundle
REM a setup script during the interview. The runtime calls this on first run
REM if any LOCAL model isn't available.
REM
REM Substitute the model list at code-gen time. One `ollama pull` per LOCAL
REM model the worker uses.

setlocal enabledelayedexpansion

REM {{MODEL_LIST}} is replaced by the forge with the actual model names,
REM space-separated. Example: set MODELS=llama3.2:3b llava
set MODELS={{MODEL_LIST}}

where ollama >nul 2>&1
if errorlevel 1 (
    echo Ollama is not installed. Install it from https://ollama.com and re-run this script.
    exit /b 1
)

for %%M in (%MODELS%) do (
    ollama list | findstr /B /C:"%%M " >nul
    if errorlevel 1 (
        echo Pulling %%M ^(this can take a few minutes^)...
        ollama pull %%M
    ) else (
        echo Model already present: %%M
    )
)

echo All models ready.

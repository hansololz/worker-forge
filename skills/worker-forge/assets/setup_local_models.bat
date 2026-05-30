@echo off
REM Ensure the worker's LOCAL models are present on first run.
REM Copied into a workspace's resources\ folder when the user agreed to bundle
REM a setup script during the interview. The runtime calls this on first run
REM if any LOCAL model isn't available.
REM
REM The forge substitutes two things at code-gen time:
REM   RUNTIME  - the tool the user picked ("ollama" or "huggingface"). Recommend
REM              Ollama only when the model is in the Ollama library; use Hugging
REM              Face for Hub-only checkpoints.
REM   MODELS   - the model list, space-separated. Ollama library tags
REM              (e.g. llama3.2:3b llava) or Hugging Face repo ids
REM              (e.g. meta-llama/Llama-3.2-3B-Instruct).

setlocal enabledelayedexpansion

REM {{RUNTIME}} and {{MODEL_LIST}} are replaced by the forge.
set RUNTIME={{RUNTIME}}
set MODELS={{MODEL_LIST}}

if /I "%RUNTIME%"=="ollama" goto :ollama
if /I "%RUNTIME%"=="huggingface" goto :hf
if /I "%RUNTIME%"=="transformers" goto :hf
if /I "%RUNTIME%"=="hf" goto :hf
echo Unknown LOCAL runtime: "%RUNTIME%". Expected "ollama" or "huggingface".
exit /b 1

:ollama
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
goto :done

:hf
REM `hf` is the current CLI; older installs expose `huggingface-cli`.
set HF_CLI=
where hf >nul 2>&1
if not errorlevel 1 set HF_CLI=hf
if "%HF_CLI%"=="" (
    where huggingface-cli >nul 2>&1
    if not errorlevel 1 set HF_CLI=huggingface-cli
)
if "%HF_CLI%"=="" (
    echo Hugging Face CLI not found. Run "pip install huggingface_hub" and re-run this script.
    exit /b 1
)
for %%M in (%MODELS%) do (
    echo Downloading %%M into the local Hugging Face cache ^(this can take a few minutes^)...
    %HF_CLI% download %%M
)
goto :done

:done
echo All models ready.

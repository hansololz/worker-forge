#!/usr/bin/env bash
# Ensure Ollama is installed and the models this worker needs are pulled.
# Copied into a workspace's resources/ folder when the user agreed to bundle
# a setup script during the interview. The runtime calls this on first run
# if any LOCAL model isn't available.
#
# Substitute the model list at code-gen time. One `ollama pull` per LOCAL
# model the worker uses.

set -euo pipefail

# {{MODEL_LIST}} is replaced by the forge with the actual model names,
# space-separated. Example: MODELS="llama3.2:3b llava"
MODELS="{{MODEL_LIST}}"

if ! command -v ollama >/dev/null 2>&1; then
    echo "Ollama is not installed. Install it from https://ollama.com and re-run this script."
    exit 1
fi

for model in $MODELS; do
    if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$model"; then
        echo "Model already present: $model"
    else
        echo "Pulling $model (this can take a few minutes)..."
        ollama pull "$model"
    fi
done

echo "All models ready."

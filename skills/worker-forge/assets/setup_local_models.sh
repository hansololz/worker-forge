#!/usr/bin/env bash
# Ensure the worker's LOCAL models are present on first run.
# Copied into a workspace's resources/ folder when the user agreed to bundle
# a setup script during the interview. The runtime calls this on first run
# if any LOCAL model isn't available.
#
# The forge substitutes two things at code-gen time:
#   RUNTIME    — the tool the user picked to run the model ("ollama" or
#                "huggingface"). Recommend Ollama only when the model is in the
#                Ollama library; use Hugging Face for Hub-only checkpoints.
#   MODELS     — the model list, space-separated. For Ollama these are library
#                tags (e.g. "llama3.2:3b llava"); for Hugging Face they're Hub
#                repo ids (e.g. "meta-llama/Llama-3.2-3B-Instruct").

set -euo pipefail

# {{RUNTIME}} and {{MODEL_LIST}} are replaced by the forge.
RUNTIME="{{RUNTIME}}"
MODELS="{{MODEL_LIST}}"

case "$RUNTIME" in
    ollama)
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
        ;;
    huggingface|transformers|hf)
        # `hf` is the current CLI; older installs expose `huggingface-cli`.
        if command -v hf >/dev/null 2>&1; then
            HF_CLI="hf"
        elif command -v huggingface-cli >/dev/null 2>&1; then
            HF_CLI="huggingface-cli"
        else
            echo "Hugging Face CLI not found. Run 'pip install huggingface_hub' and re-run this script."
            exit 1
        fi
        for model in $MODELS; do
            echo "Downloading $model into the local Hugging Face cache (this can take a few minutes)..."
            "$HF_CLI" download "$model"
        done
        ;;
    *)
        echo "Unknown LOCAL runtime: '$RUNTIME'. Expected 'ollama' or 'huggingface'."
        exit 1
        ;;
esac

echo "All models ready."

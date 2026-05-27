#!/bin/sh
# ApeAI — Layer 4: Integration Pipeline Verifier
# Sets up context, runs Python integration test suite.

# Activate virtualenv if present
if [ -d ".venv" ]; then
    . .venv/bin/activate
fi

# Ensure PYTHONPATH includes current directory
export PYTHONPATH=.

python3 tests/test_publish_flow.py

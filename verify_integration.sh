#!/bin/sh
# ApeAI — Cross-Layer Integration Verifier
# This script tests the flow from Layer 1 Ingestion to Layer 2 Storage

BASE_URL="http://localhost:8000"

echo "=========================================="
echo "🦍 ApeAI: Layer 1 ↔ Layer 2 Verification"
echo "=========================================="

# 1. Ingest Feedback (Layer 1)
echo "\n[Step 1] Ingesting dummy feedback via Layer 1..."
FEEDBACK_RESPONSE=$(curl -s -X POST "$BASE_URL/feedback/manual" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Verification test: The dashboard loading time is slow in the morning.",
    "author": "VerificationBot",
    "metadata": {"test_run": true}
  }')

FEEDBACK_ID=$(echo $FEEDBACK_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$FEEDBACK_ID" ]; then
    echo "❌ Error: Failed to ingest feedback. Response: $FEEDBACK_RESPONSE"
    exit 1
fi
echo "✅ Success! Feedback ingested with ID: $FEEDBACK_ID"

# 2. Check Feedback Stats (Layer 1)
echo "\n[Step 2] Checking Layer 1 stats..."
curl -s "$BASE_URL/feedback/stats" | python3 -m json.tool

# 3. Trigger Embedding (Layer 2)
echo "\n[Step 3] Triggering Layer 2 to embed the new feedback..."
EMBED_RESPONSE=$(curl -s -X POST "$BASE_URL/embeddings/batch" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "✅ Response: $EMBED_RESPONSE"

# 4. Check Pipeline Status (Layer 2)
echo "\n[Step 4] Verifying Layer 2 Pipeline Status..."
curl -s "$BASE_URL/pipeline/status" | python3 -m json.tool

echo "\n=========================================="
echo "🎉 Verification Complete!"
echo "If 'total_embedded' matches 'total_feedback', the layers are linked."
echo "=========================================="

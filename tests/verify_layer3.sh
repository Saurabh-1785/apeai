#!/bin/sh
# ApeAI — Layer 3: AI Pipeline Verifier
# This script tests the full flow from Clustering to Task Breakdown.

BASE_URL="http://127.0.0.1:8000"

echo "=========================================="
echo "🦍 ApeAI: Layer 3 Pipeline Verification"
echo "=========================================="

# 1. Clustering
echo "\n[Step 1] Triggering Clustering for all unprocessed feedback..."
CLUSTER_RES=$(curl -s -X POST "$BASE_URL/pipeline/cluster")
echo "✅ Response: $CLUSTER_RES"

# Get the first cluster ID for testing (requires python to parse JSON)
CLUSTER_ID=$(curl -s "$BASE_URL/clusters" | python3 -c "import sys, json; print(json.load(sys.stdin)['clusters'][0]['id'] if json.load(sys.stdin)['clusters'] else '')" 2>/dev/null)

if [ -z "$CLUSTER_ID" ]; then
    # If no cluster exists, check stats and pick one
    CLUSTER_ID=$(curl -s "$BASE_URL/clusters" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['clusters'][0]['id'] if data['clusters'] else '')")
fi

if [ -z "$CLUSTER_ID" ]; then
    echo "❌ Error: No clusters found to test the pipeline. Please ingest some feedback first."
    exit 1
fi

echo "🎯 Using Cluster ID: $CLUSTER_ID"

# 2. Summarization
echo "\n[Step 2] Summarizing cluster..."
SUM_RES=$(curl -s -X POST "$BASE_URL/pipeline/summarize/$CLUSTER_ID")
echo "✅ Response: $(echo $SUM_RES | cut -c1-100)..."

# 3. BRD Generation
echo "\n[Step 3] Generating BRD..."
BRD_RES=$(curl -s -X POST "$BASE_URL/pipeline/generate-brd/$CLUSTER_ID")
BRD_ID=$(echo $BRD_RES | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))")
echo "✅ BRD Created ID: $BRD_ID"

# 4. PRD Generation
echo "\n[Step 4] Generating PRD..."
PRD_RES=$(curl -s -X POST "$BASE_URL/pipeline/generate-prd/$CLUSTER_ID?brd_id=$BRD_ID")
PRD_ID=$(echo $PRD_RES | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))")
echo "✅ PRD Created ID: $PRD_ID"

# 5. User Stories
echo "\n[Step 5] Generating Agile User Stories..."
STORY_RES=$(curl -s -X POST "$BASE_URL/pipeline/generate-stories/$CLUSTER_ID?prd_id=$PRD_ID")
STORY_ID=$(echo $STORY_RES | python3 -c "import sys, json; print(json.load(sys.stdin)[0].get('id', ''))")
echo "✅ Stories Created. Example Story ID: $STORY_ID"

# 6. Task Breakdown
echo "\n[Step 6] Generating Technical Tasks for story $STORY_ID..."
TASK_RES=$(curl -s -X POST "$BASE_URL/pipeline/generate-tasks/$STORY_ID?cluster_id=$CLUSTER_ID")
echo "✅ Response: $(echo $TASK_RES | cut -c1-100)..."

echo "\n=========================================="
echo "🎉 Layer 3 Verification Complete!"
echo "Check your Supabase 'documents' table to see the generated JSON."
echo "=========================================="

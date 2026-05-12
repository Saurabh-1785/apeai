#!/bin/sh
# Test script for ApeAI Layer 2 endpoints
# Verifies all new storage layer routes are responding

BASE_URL="http://localhost:8000"

echo "=========================================="
echo "ApeAI Layer 2 — Endpoint Tests"
echo "=========================================="

# Test 1: Root (updated with Layer 2)
echo ""
echo "--- Test 1: GET / (Root — should show Layer 2 endpoints) ---"
curl -s "$BASE_URL/" | python3 -m json.tool
echo ""

# Test 2: Health
echo "--- Test 2: GET /health ---"
curl -s "$BASE_URL/health" | python3 -m json.tool
echo ""

# Test 3: Embedding stats
echo "--- Test 3: GET /embeddings/stats ---"
curl -s "$BASE_URL/embeddings/stats" | python3 -m json.tool
echo ""

# Test 4: Embedding create (should fail — no OpenAI key)
echo "--- Test 4: POST /embeddings/create (expects error — no OpenAI key) ---"
curl -s -X POST "$BASE_URL/embeddings/create" \
  -H "Content-Type: application/json" \
  -d '{"feedback_id": "00000000-0000-0000-0000-000000000000"}'
echo ""
echo ""

# Test 5: Similarity search validation
echo "--- Test 5: POST /embeddings/search (expects 400 — no query) ---"
curl -s -X POST "$BASE_URL/embeddings/search" \
  -H "Content-Type: application/json" \
  -d '{}'
echo ""
echo ""

# Test 6: List clusters (empty)
echo "--- Test 6: GET /clusters/ ---"
curl -s "$BASE_URL/clusters/" | python3 -m json.tool
echo ""

# Test 7: Create cluster (should fail — no Supabase)
echo "--- Test 7: POST /clusters/ (expects 503 — needs Supabase) ---"
curl -s -X POST "$BASE_URL/clusters/" \
  -H "Content-Type: application/json" \
  -d '{"title": "Dashboard Performance Issues", "summary": "Users report slow dashboard"}'
echo ""
echo ""

# Test 8: Cluster stats
echo "--- Test 8: GET /clusters/stats ---"
curl -s "$BASE_URL/clusters/stats" | python3 -m json.tool
echo ""

# Test 9: List documents (empty)
echo "--- Test 9: GET /documents/ ---"
curl -s "$BASE_URL/documents/" | python3 -m json.tool
echo ""

# Test 10: List approvals (empty)
echo "--- Test 10: GET /approvals/ ---"
curl -s "$BASE_URL/approvals/" | python3 -m json.tool
echo ""

# Test 11: List integrations (empty)
echo "--- Test 11: GET /integrations/ ---"
curl -s "$BASE_URL/integrations/" | python3 -m json.tool
echo ""

# Test 12: List ticket links (empty)
echo "--- Test 12: GET /ticket-links/ ---"
curl -s "$BASE_URL/ticket-links/" | python3 -m json.tool
echo ""

# Test 13: Pipeline status
echo "--- Test 13: GET /pipeline/status ---"
curl -s "$BASE_URL/pipeline/status" | python3 -m json.tool
echo ""

echo "=========================================="
echo "Layer 2 Tests complete!"
echo "=========================================="

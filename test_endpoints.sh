#!/bin/sh
# Test script for ApeAI Layer 1 endpoints

BASE_URL="http://localhost:8000"

echo "=========================================="
echo "ApeAI Layer 1 — Endpoint Tests"
echo "=========================================="

# Test 1: Root
echo ""
echo "--- Test 1: GET / (Root) ---"
curl -s "$BASE_URL/" | python3 -m json.tool
echo ""

# Test 2: Health
echo "--- Test 2: GET /health ---"
curl -s "$BASE_URL/health" | python3 -m json.tool
echo ""

# Test 3: Manual feedback
echo "--- Test 3: POST /feedback/manual ---"
curl -s -X POST "$BASE_URL/feedback/manual" \
  -H "Content-Type: application/json" \
  -d '{"content": "Dashboard is slow and laggy", "author": "test_user"}'
echo ""
echo ""

# Test 4: Manual feedback (anonymous)
echo "--- Test 4: POST /feedback/manual (anonymous) ---"
curl -s -X POST "$BASE_URL/feedback/manual" \
  -H "Content-Type: application/json" \
  -d '{"content": "Search feature returns wrong results"}'
echo ""
echo ""

# Test 5: Manual feedback (validation error — empty content)
echo "--- Test 5: POST /feedback/manual (should fail — empty content) ---"
curl -s -X POST "$BASE_URL/feedback/manual" \
  -H "Content-Type: application/json" \
  -d '{"content": ""}'
echo ""
echo ""

# Test 6: Stats
echo "--- Test 6: GET /feedback/stats ---"
curl -s "$BASE_URL/feedback/stats" | python3 -m json.tool
echo ""

echo "=========================================="
echo "Tests complete!"
echo "=========================================="

import sys
import os

# Add project root to path
sys.path.append(os.getcwd())

print("🔍 Checking syntax and imports for Layer 3 files...")

try:
    from backend.app.ai.gemini_client import gemini_client
    print("✅ gemini_client.py: OK")
    
    from backend.app.ai.prompts import CLUSTER_SUMMARY_PROMPT
    print("✅ ai/prompts: OK")
    
    from backend.app.ai.services.clustering_service import cluster_unprocessed_feedback
    print("✅ clustering_service.py: OK")
    
    from backend.app.ai.services.generation_service import summarize_cluster
    print("✅ generation_service.py: OK")
    
    from backend.app.routes.pipeline import router
    print("✅ routes/pipeline.py: OK")
    
    from backend.app.main import app
    print("✅ main.py (with new routes): OK")

except Exception as e:
    print(f"❌ Error detected: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

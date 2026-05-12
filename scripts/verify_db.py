import asyncio
import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from backend.app.db.supabase_client import get_supabase_client

async def verify():
    print("🔍 Checking Supabase connection...")
    try:
        client = get_supabase_client()
        # Try to select from the feedback table
        response = client.table("feedback").select("id", count="exact").limit(1).execute()
        print(f"✅ Connection successful!")
        print(f"✅ 'feedback' table found. Current row count: {response.count if response.count is not None else 0}")
    except Exception as e:
        print(f"❌ Verification failed: {e}")
        if "PGRST205" in str(e):
            print("\n💡 HINT: The 'feedback' table is missing. Run the SQL schema in Supabase Editor.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(verify())

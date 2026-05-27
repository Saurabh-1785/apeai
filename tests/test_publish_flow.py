"""
ApeAI — Layer 4 Integration Test Script
"""
import asyncio
import httpx
import logging
import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from backend.app.db.supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_publish")

async def run_tests():
    db = get_supabase_client()
    base_url = "http://127.0.0.1:8000"
    
    print("\n==========================================")
    print("🧪 Starting Layer 4 Publication Tests")
    print("==========================================\n")
    
    # 1. Cleanup old mock entries
    db.table("integrations").delete().eq("name", "MOCK_TEST_GITHUB").execute()
    db.table("integrations").delete().eq("name", "MOCK_TEST_JIRA").execute()
    db.table("integrations").delete().eq("name", "MOCK_TEST_LINEAR").execute()
    
    # 2. Add Mock Integrations (Dry-Run Mode)
    print("[Setup] Creating dry-run integration records...")
    gh_int = db.table("integrations").insert({
        "type": "github",
        "name": "MOCK_TEST_GITHUB",
        "api_key": "mock-token",
        "project_id": "saurabh1785/apeai",
        "config": {"dry_run": True},
        "is_active": True
    }).execute()
    
    jira_int = db.table("integrations").insert({
        "type": "jira",
        "name": "MOCK_TEST_JIRA",
        "api_key": "mock-token",
        "project_id": "PROJ",
        "api_url": "https://mock-domain.atlassian.net",
        "config": {"dry_run": True, "email": "test@example.com"},
        "is_active": True
    }).execute()
    
    linear_int = db.table("integrations").insert({
        "type": "linear",
        "name": "MOCK_TEST_LINEAR",
        "api_key": "mock-token",
        "project_id": "team-uuid-123",
        "config": {"dry_run": True},
        "is_active": True
    }).execute()
    
    gh_id = gh_int.data[0]["id"]
    jira_id = jira_int.data[0]["id"]
    linear_id = linear_int.data[0]["id"]
    print(f"✅ Created mock integrations: GitHub({gh_id}), Jira({jira_id}), Linear({linear_id})")
    
    # 3. Resolve parent cluster
    cluster_res = db.table("clusters").select("id").limit(1).execute()
    if cluster_res.data:
        cluster_id = cluster_res.data[0]["id"]
    else:
        new_c = db.table("clusters").insert({
            "title": "Test Publish Cluster",
            "summary": "Integration testing for Layer 4"
        }).execute()
        cluster_id = new_c.data[0]["id"]
        
    # 4. Create an APPROVED document
    print("[Setup] Creating approved user story for publishing...")
    story_doc = db.table("documents").insert({
        "cluster_id": cluster_id,
        "type": "story",
        "title": "Integrate Google analytics tracker",
        "content": {
            "title": "Integrate Google analytics tracker",
            "user_role": "As a marketer",
            "requirement": "I want to track visitor flows",
            "benefit": "so that I can measure platform engagement",
            "acceptance_criteria": ["Tracking code installed", "Daily reports generated"],
            "priority": "Should Have"
        },
        "status": "approved"
    }).execute()
    approved_doc_id = story_doc.data[0]["id"]
    print(f"✅ Story Document created in 'approved' status: ID {approved_doc_id}")
    
    # 5. Create a DRAFT document
    print("[Setup] Creating draft user story for publishing gate test...")
    draft_doc = db.table("documents").insert({
        "cluster_id": cluster_id,
        "type": "story",
        "title": "Draft story item",
        "content": {"title": "Draft story item"},
        "status": "draft"
    }).execute()
    draft_doc_id = draft_doc.data[0]["id"]
    print(f"✅ Story Document created in 'draft' status: ID {draft_doc_id}")
    
    # -------------------------------------------------------------------------
    # TEST 1: Block Draft Document
    # -------------------------------------------------------------------------
    print("\n------------------------------------------")
    print("TEST 1: Human-in-the-Loop Approval Gate Check")
    print("------------------------------------------")
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{base_url}/publish/github/{draft_doc_id}?integration_id={gh_id}")
        print(f"HTTP Status: {res.status_code}")
        print(f"Response Body: {res.text}")
        if res.status_code == 400 and "Only approved documents can be published" in res.text:
            print("🎉 PASS: API successfully blocked draft document publication!")
        else:
            print("❌ FAIL: API failed to block draft document publication!")
            
    # -------------------------------------------------------------------------
    # TEST 2: Successful Publish to GitHub
    # -------------------------------------------------------------------------
    print("\n------------------------------------------")
    print("TEST 2: Successful Publish to GitHub (Dry-Run)")
    print("------------------------------------------")
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{base_url}/publish/github/{approved_doc_id}?integration_id={gh_id}")
        print(f"HTTP Status: {res.status_code}")
        print(f"Response Body: {res.json()}")
        
        # Verify status in db is updated to published
        chk = db.table("documents").select("status").eq("id", approved_doc_id).single().execute()
        db_status = chk.data["status"]
        print(f"Document Status in DB: {db_status}")
        
        # Verify ticket link exists
        link_chk = db.table("ticket_links").select("*").eq("document_id", approved_doc_id).execute()
        
        if res.status_code == 200 and db_status == "published" and len(link_chk.data) > 0:
            print("🎉 PASS: Document successfully published and logged in DB!")
            link_record = link_chk.data[0]
            print(f"🔗 External URL: {link_record['external_url']} | External ID: {link_record['external_id']}")
        else:
            print("❌ FAIL: Document publication was unsuccessful!")
            
    # -------------------------------------------------------------------------
    # TEST 3: Duplicate Publishing Prevention
    # -------------------------------------------------------------------------
    print("\n------------------------------------------")
    print("TEST 3: Duplicate Publishing Prevention Check")
    print("------------------------------------------")
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{base_url}/publish/github/{approved_doc_id}?integration_id={gh_id}")
        print(f"HTTP Status: {res.status_code}")
        print(f"Response Body: {res.text}")
        if res.status_code == 400 and "already been published" in res.text:
            print("🎉 PASS: Duplicate publisher guard worked perfectly!")
        else:
            print("❌ FAIL: Duplicate publisher guard did not trigger!")
 
    # -------------------------------------------------------------------------
    # TEST 4: Jira Dry-Run Publication
    # -------------------------------------------------------------------------
    print("\n------------------------------------------")
    print("TEST 4: Jira Dry-Run Publication")
    print("------------------------------------------")
    # Reset status of the document back to approved so we can publish to Jira
    db.table("documents").update({"status": "approved"}).eq("id", approved_doc_id).execute()
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{base_url}/publish/jira/{approved_doc_id}?integration_id={jira_id}")
        print(f"HTTP Status: {res.status_code}")
        print(f"Response Body: {res.json()}")
        if res.status_code == 200:
            print("🎉 PASS: Jira dry-run publication completed successfully!")
        else:
            print("❌ FAIL: Jira dry-run publication failed!")
 
    # -------------------------------------------------------------------------
    # TEST 5: Linear Dry-Run Publication
    # -------------------------------------------------------------------------
    print("\n------------------------------------------")
    print("TEST 5: Linear Dry-Run Publication")
    print("------------------------------------------")
    # Reset status back to approved
    db.table("documents").update({"status": "approved"}).eq("id", approved_doc_id).execute()
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{base_url}/publish/linear/{approved_doc_id}?integration_id={linear_id}")
        print(f"HTTP Status: {res.status_code}")
        print(f"Response Body: {res.json()}")
        if res.status_code == 200:
            print("🎉 PASS: Linear dry-run publication completed successfully!")
        else:
            print("❌ FAIL: Linear dry-run publication failed!")
 
    # Cleanup test entries
    print("\n[Cleanup] Cleaning up mock documents and integrations...")
    db.table("documents").delete().eq("id", approved_doc_id).execute()
    db.table("documents").delete().eq("id", draft_doc_id).execute()
    db.table("integrations").delete().eq("id", gh_id).execute()
    db.table("integrations").delete().eq("id", jira_id).execute()
    db.table("integrations").delete().eq("id", linear_id).execute()
    print("🧹 Test cleanup completed successfully.")
    
    print("\n==========================================")
    print("🎉 Layer 4 Verification Complete!")
    print("==========================================\n")
 
if __name__ == "__main__":
    asyncio.run(run_tests())

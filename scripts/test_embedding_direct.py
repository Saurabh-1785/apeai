import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
genai.configure(api_key=api_key)

print("🧪 Testing Gemini Embedding...")

test_text = "Hello world"
possible_models = ["models/embedding-001", "models/text-embedding-004", "embedding-001", "text-embedding-004"]

for model in possible_models:
    print(f"\nTrying model: {model}...")
    try:
        res = genai.embed_content(model=model, content=test_text)
        print(f"✅ SUCCESS! Vector length: {len(res['embedding'])}")
        print(f"USE THIS MODEL NAME: {model}")
        break
    except Exception as e:
        print(f"❌ FAILED: {e}")

print("\n--- Available Models for your Key ---")
try:
    for m in genai.list_models():
        if 'embedContent' in m.supported_generation_methods:
            print(f"Model: {m.name} | Methods: {m.supported_generation_methods}")
except Exception as e:
    print(f"Could not list models: {e}")

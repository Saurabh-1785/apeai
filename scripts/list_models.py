import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("❌ GOOGLE_API_KEY not found")
    exit(1)

genai.configure(api_key=api_key)

print("🔍 Listing available Gemini models...")
try:
    for m in genai.list_models():
        if 'embedContent' in m.supported_generation_methods or 'generateContent' in m.supported_generation_methods:
            print(f"- {m.name} ({m.display_name})")
except Exception as e:
    print(f"❌ Error: {e}")

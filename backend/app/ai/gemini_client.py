"""
ApeAI — Gemini AI Client

Centralized client for interacting with Google Gemini API.
Handles model initialization, configuration, and structured JSON output.
"""

import logging
from typing import Optional, Any, Dict

import google.generativeai as genai
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Model Mapping (Exact names from your ListModels output)
MODEL_MAPPING = {
    "flash": "gemini-1.5-flash", 
    "pro": "gemini-1.5-pro",     
    "embedding": "models/gemini-embedding-2" 
}

class GeminiClient:
    """Singleton client for Google Gemini."""
    
    _instance = None
    _configured = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GeminiClient, cls).__new__(cls)
        return cls._instance

    def _configure(self):
        """Lazy configuration of the SDK."""
        if not self._configured:
            if not settings.google_api_key:
                raise RuntimeError("GOOGLE_API_KEY is not set in environment")
            
            genai.configure(api_key=settings.google_api_key)
            self._configured = True
            logger.info("✅ Gemini AI SDK configured")

    def get_model(self, model_type: str = "flash", json_mode: bool = False) -> genai.GenerativeModel:
        """
        Get a Gemini model instance.
        
        Args:
            model_type: 'flash' for speed, 'pro' for reasoning.
            json_mode: If True, configures the model for JSON output.
        """
        self._configure()
        model_name = MODEL_MAPPING.get(model_type, MODEL_MAPPING["flash"])
        
        generation_config = {}
        if json_mode:
            generation_config["response_mime_type"] = "application/json"
            
        return genai.GenerativeModel(
            model_name=model_name,
            generation_config=generation_config if json_mode else None
        )

    async def embed_text(self, text: str, task_type: str = "clustering") -> Any:
        """Generate vector embedding for text."""
        self._configure()
        # Note: genai.embed_content is synchronous, usually wrapped in executor
        # but for simplicity in this helper we just call it. 
        # The service layer should handle async execution if needed.
        return genai.embed_content(
            model=MODEL_MAPPING["embedding"],
            content=text,
            task_type=task_type
        )

# Singleton instance
gemini_client = GeminiClient()

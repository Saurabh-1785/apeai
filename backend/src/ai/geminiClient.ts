/**
 * ApeAI — Gemini AI Client
 *
 * Centralized client for interacting with Google Gemini API.
 */

import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
import settings from '../config';

/** Text-generation models. */
const MODEL_MAPPING: Record<'flash' | 'pro', string> = {
  flash: 'gemini-2.5-flash-lite',
  pro: 'gemini-2.5-flash-lite',
};

/**
 * Embedding model. `text-embedding-004` was retired by Google, so we use
 * `gemini-embedding-001` and request 768-dim output to match the
 * `vector(768)` column. Changing this value makes existing embeddings
 * stale; they are re-generated automatically on the next batch run
 * (see embeddingService.createEmbeddingsBatch).
 */
export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

class GeminiClient {
  private static _instance: GeminiClient;
  private _genAI: GoogleGenerativeAI | null = null;

  static getInstance(): GeminiClient {
    if (!GeminiClient._instance) {
      GeminiClient._instance = new GeminiClient();
    }
    return GeminiClient._instance;
  }

  private apiKey(): string {
    if (!settings.googleApiKey) {
      throw new Error('GOOGLE_API_KEY is not set in environment');
    }
    return settings.googleApiKey;
  }

  private configure(): GoogleGenerativeAI {
    if (this._genAI) return this._genAI;
    this._genAI = new GoogleGenerativeAI(this.apiKey());
    console.info('✅ Gemini AI SDK configured');
    return this._genAI;
  }

  getModel(modelType: 'flash' | 'pro' = 'flash', jsonMode = false): GenerativeModel {
    const genAI = this.configure();
    const modelName = MODEL_MAPPING[modelType] ?? MODEL_MAPPING.flash;

    const generationConfig: GenerationConfig | undefined = jsonMode
      ? { responseMimeType: 'application/json' }
      : undefined;

    return genAI.getGenerativeModel({ model: modelName, generationConfig });
  }

  /**
   * Embeds text with EMBEDDING_MODEL at EMBEDDING_DIMENSIONS.
   * Uses the REST endpoint directly because the installed SDK version
   * does not support `outputDimensionality`.
   */
  async embedText(text: string): Promise<number[]> {
    const url = `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:embedContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey(),
      },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini embedContent failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as { embedding?: { values?: number[] } };
    const values = data.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Gemini embedContent returned no embedding values');
    }

    // Truncated (non-3072) gemini-embedding outputs are not unit-length;
    // normalize so dot-product and cosine agree.
    const vec = values.slice(0, EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

export const geminiClient = GeminiClient.getInstance();

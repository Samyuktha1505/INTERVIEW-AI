from backend.utils.prompts import generate_metrics_prompt
from google import genai
import logging

model_id = "gemini-2.0-flash"

async def generate_metrics_from_transcript(transcript_text: str):
    prompt = generate_metrics_prompt(transcript_text)
    model = genai.GenerativeModel(model_id)
    response = await model.generate_content_async(prompt)
    logging.info("Received LLM response for metrics generation.")
    return response.text

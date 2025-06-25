from backend.utils.prompts import llm1_prompt
from google import genai  # Your LLM client
import json
import logging

model_id = "gemini-2.0-flash"

async def analyze_resume(resume_text, target_role, target_company, years_of_experience, current_designation, session_interval, interview_type):
    prompt = llm1_prompt(
        resume_text,
        target_role,
        target_company,
        years_of_experience,
        current_designation,
        session_interval,
        interview_type
    )
    model = genai.GenerativeModel(model_id)
    response = await model.generate_content_async(prompt)
    raw_output = response.text
    logging.info("Received LLM response for resume analysis.")
    return raw_output

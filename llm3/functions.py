import fitz  # PyMuPDF
import json
import re
import logging  # <-- ADD THIS LINE

def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extracts text from all pages of a PDF file using PyMuPDF.
    """
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def clean_json_string(raw_string: str) -> str:
    """
    Cleans a raw string by removing code block markers like ```json and ```.
    """
    # This regex is improved to handle optional 'json' text
    return re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', raw_string).strip()

def extract_metrics_from_json(raw_string: str) -> dict:
    """
    Processes a raw LLM response string to extract the 'Metrics' JSON object.
    """
    cleaned_string = clean_json_string(raw_string)
    try:
        data = json.loads(cleaned_string)
        # Specifically return the dictionary inside the "Metrics" key
        return data.get("Metrics", {})
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode JSON from LLM response: {e}")
        raise ValueError(f"Invalid JSON format in LLM response: {e}")
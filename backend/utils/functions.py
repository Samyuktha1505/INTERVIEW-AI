import fitz  # PyMuPDF
import json
import re
import logging

func_logger = logging.getLogger(__name__)
func_logger.setLevel(logging.INFO)

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    func_logger.info("Extracting text from PDF bytes")
    doc = fitz.open("pdf", pdf_bytes)
    text = ""
    for page_num, page in enumerate(doc):
        page_text = page.get_text()
        text += page_text
        func_logger.debug(f"Page {page_num + 1} length: {len(page_text)}")
    func_logger.info(f"Total extracted text length: {len(text)}")
    return text

def clean_json_string(raw_string: str) -> str:
    func_logger.info("Cleaning raw JSON string from LLM response.")
    cleaned = re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', raw_string)
    cleaned = re.sub(r'[\x00-\x1F\x7F]', '', cleaned)
    return cleaned.strip()

def process_and_extract_json_data(raw_string):
    func_logger.info("Starting JSON extraction and parsing.")
    cleaned_string = clean_json_string(raw_string)
    func_logger.info(f"Cleaned JSON length: {len(cleaned_string)}")

    try:
        data = json.loads(cleaned_string)
        func_logger.info("JSON loaded successfully.")
        extracted_fields = data.get("Extracted_fields", {})
        questionnaire_prompt = data.get("Questionnaire_prompt", [])
        return json.dumps(extracted_fields, indent=2), json.dumps(questionnaire_prompt, indent=2)
    except json.JSONDecodeError as e:
        func_logger.error(f"JSON decode error: {e}", exc_info=True)
        func_logger.error(f"Failed JSON (first 500 chars): {cleaned_string[:500]}")
        raise ValueError(f"Invalid JSON format: {e}")

def extract_metrics_from_json(raw_string: str) -> dict:
    func_logger.info("Extracting metrics from LLM response.")
    cleaned_string = clean_json_string(raw_string)

    try:
        match = re.search(r'\{.*\}', cleaned_string, re.DOTALL)
        if not match:
            raise ValueError("No valid JSON object found.")
        json_string = match.group(0)
        data = json.loads(json_string)
        if isinstance(data, dict) and "Metrics" in data:
            return data["Metrics"]
        return data
    except json.JSONDecodeError as e:
        func_logger.error(f"Metrics JSON decode error: {e}", exc_info=True)
        raise ValueError(f"Invalid metrics JSON format: {e}")
    except Exception as e:
        func_logger.error(f"Unexpected error parsing metrics JSON: {e}")
        raise

import fitz  # PyMuPDF
import json
import re
import logging

# Configure a logger for this module (kept from original backend)
func_logger = logging.getLogger(__name__)
func_logger.setLevel(logging.INFO)

def extract_text_from_pdf(pdf_path):
    """
    Extracts all text from a PDF using PyMuPDF.
    (Using the version from backend with more detailed logging)
    """
    func_logger.info(f"Attempting to extract text from PDF: {pdf_path}")
    doc = fitz.open(pdf_path)
    text = ""
    for page_num, page in enumerate(doc):
        page_text = page.get_text()
        text += page_text
        func_logger.debug(f"Extracted text from page {page_num + 1}, length: {len(page_text)}")
    func_logger.info(f"Finished extracting text. Total length: {len(text)}")
    return text

def clean_json_string(raw_string: str) -> str:
    """
    Cleans a raw string by removing code block markers and control characters.
    (Using the more robust version from llm3)
    """
    func_logger.info("Cleaning raw JSON string from LLM response.")
    # Remove ```json ... ``` or ``` ... ``` blocks
    cleaned = re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', raw_string)
    # Remove control characters like \x00-\x1F that can break JSON parsing
    cleaned = re.sub(r'[\x00-\x1F\x7F]', '', cleaned)
    return cleaned.strip()

def process_and_extract_json_data(raw_string):
    """
    Cleans and parses JSON data from the resume analysis LLM response.
    Returns a tuple of (Extracted_fields, Questionnaire_prompt) as JSON-formatted strings.
    (This function is unique to the original backend and is preserved)
    """
    func_logger.info("Starting JSON data extraction and parsing for resume analysis.")
    cleaned_string = clean_json_string(raw_string)
    func_logger.info(f"Cleaned JSON string length: {len(cleaned_string)}")

    try:
        data = json.loads(cleaned_string)
        func_logger.info("Successfully loaded JSON data.")

        extracted_fields = data.get("Extracted_fields", {})
        questionnaire_prompt = data.get("Questionnaire_prompt", [])
        
        func_logger.info("Extracted 'Extracted_fields' and 'Questionnaire_prompt' from JSON.")

        return json.dumps(extracted_fields, indent=2), json.dumps(questionnaire_prompt, indent=2)

    except json.JSONDecodeError as e:
        func_logger.error(f"JSON Decode Error: {e}", exc_info=True)
        func_logger.error(f"Failed JSON string (first 500 chars):\n{cleaned_string[:500]}...")
        raise ValueError(f"Invalid JSON format received from LLM: {e}")

def extract_metrics_from_json(raw_string: str) -> dict:
    """
    Extracts and parses a JSON object containing interview metrics from LLM response.
    Tries to parse entire JSON, or a nested 'Metrics' object if available.
    (Using the more robust version from llm3)
    """
    func_logger.info("Extracting metrics from LLM response.")
    cleaned_string = clean_json_string(raw_string)

    try:
        # Use regex to extract JSON object if the string contains extra text
        match = re.search(r'\{.*\}', cleaned_string, re.DOTALL)
        if not match:
            raise ValueError("No valid JSON object found in the LLM response.")

        json_string = match.group(0)
        data = json.loads(json_string)

        # Return the 'Metrics' dictionary if it's nested, otherwise return the whole object
        if isinstance(data, dict) and "Metrics" in data:
            metrics_data = data["Metrics"]
            func_logger.info(f"Successfully extracted nested metrics: {metrics_data}")
            return metrics_data
        
        func_logger.info(f"Successfully extracted metrics (non-nested): {data}")
        return data
    except json.JSONDecodeError as e:
        func_logger.error(f"Failed to decode JSON for metrics: {e}", exc_info=True)
        raise ValueError(f"Invalid JSON format in metrics response: {e}")
    except Exception as e:
        func_logger.error(f"An unexpected error occurred during JSON parsing for metrics: {e}")
        raise

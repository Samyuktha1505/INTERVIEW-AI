import fitz  # PyMuPDF
import json
import re
import logging

# Configure a logger for this module
func_logger = logging.getLogger(__name__)
func_logger.setLevel(logging.INFO)

def extract_text_from_pdf(pdf_path):
    """
    Extracts all text from a PDF using PyMuPDF.
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

def clean_json_string(raw_string):
    """
    Cleans LLM response by removing ```json or ``` code block formatting.
    """
    func_logger.info("Cleaning raw JSON string from LLM response.")
    # This improved regex handles optional 'json' text and various whitespaces
    return re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', raw_string).strip()

def process_and_extract_json_data(raw_string):
    """
    Cleans and parses JSON data from the resume analysis LLM response.
    Returns a tuple of (Extracted_fields, Questionnaire_prompt) as JSON-formatted strings.
    """
    func_logger.info("Starting JSON data extraction and parsing.")
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

# --- THIS IS THE NEW FUNCTION THAT WAS MISSING ---
def extract_metrics_from_json(raw_string: str) -> dict:
    """
    Processes a raw LLM response string to extract the 'Metrics' JSON object.
    """
    func_logger.info("Extracting metrics from LLM response.")
    cleaned_string = clean_json_string(raw_string)
    try:
        data = json.loads(cleaned_string)
        # Specifically return the dictionary inside the "Metrics" key
        metrics_data = data.get("Metrics", {})
        func_logger.info(f"Successfully extracted metrics: {metrics_data}")
        return metrics_data
    except json.JSONDecodeError as e:
        func_logger.error(f"Failed to decode JSON for metrics: {e}", exc_info=True)
        raise ValueError(f"Invalid JSON format in metrics response: {e}")
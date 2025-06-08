import fitz  # PyMuPDF
import json
import re
import logging # Import logging for more structured debug output

# Configure a logger for this module
# You could also use the root logger if you prefer, but a specific logger is cleaner
func_logger = logging.getLogger(__name__)
func_logger.setLevel(logging.INFO) # Set to INFO for development, DEBUG for even more verbosity
# If you want this specific logger to write to a separate file, you'd add a handler here.
# For now, it will use the basicConfig setup from main.py if not explicitly added.


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
        func_logger.debug(f"Extracted text from page {page_num + 1}, length: {len(page_text)}") # More verbose debug
    func_logger.info(f"Finished extracting text. Total length: {len(text)}")
    return text


def clean_json_string(raw_string):
    """
    Cleans LLM response by removing ```json or ``` code block formatting.
    """
    func_logger.info("Cleaning raw JSON string from LLM response.")
    func_logger.debug(f"Original raw string (first 200 chars): {raw_string[:200]}...")

    raw_string = raw_string.strip()
    func_logger.debug(f"String after initial strip (first 200 chars): {raw_string[:200]}...")

    # Remove leading ```json
    raw_string = re.sub(r'^```json', '', raw_string, flags=re.IGNORECASE).strip()
    func_logger.debug(f"String after removing '```json' (first 200 chars): {raw_string[:200]}...")

    # Remove leading/trailing ``` (allowing for multiple lines)
    raw_string = re.sub(r'^```|```$', '', raw_string, flags=re.MULTILINE).strip()
    func_logger.debug(f"String after removing '```' (first 200 chars): {raw_string[:200]}...")

    func_logger.info("JSON string cleaning complete.")
    return raw_string


def process_and_extract_json_data(raw_string):
    """
    Cleans and parses JSON data from the LLM response.
    Returns a tuple of (Extracted_fields, Questionnaire_prompt) as JSON-formatted strings.
    """
    func_logger.info("Starting JSON data extraction and parsing.")
    func_logger.debug(f"Raw string received by process_and_extract_json_data (first 500 chars): {raw_string[:500]}...")

    cleaned_string = clean_json_string(raw_string)
    func_logger.info(f"Cleaned JSON string length: {len(cleaned_string)}")
    func_logger.debug(f"Cleaned string (first 500 chars): {cleaned_string[:500]}...")


    try:
        # Optional: fix multiline strings in "Prompt" if they have newlines or quotes
        # This regex attempts to find "Prompt": "..." and replace internal newlines/quotes
        # It's a complex regex, ensure it works for your LLM's output
        fixed_string = cleaned_string
        if '"Prompt"' in cleaned_string: # Only attempt if "Prompt" key might exist
            func_logger.debug("Attempting to fix 'Prompt' multiline string within JSON.")
            # Note: This regex might need fine-tuning depending on the exact LLM output format
            # It replaces internal newlines and unescaped quotes inside the Prompt string
            fixed_string = re.sub(
                r'("Prompt"\s*:\s*")([\s\S]*?)(")',
                lambda m: f'{m.group(1)}{m.group(2).replace("\\n", " ").replace("\n", " ").replace("\"", "\\\"")}{m.group(3)}',
                cleaned_string
            )
            func_logger.debug(f"String after Prompt fix (first 500 chars): {fixed_string[:500]}...")

        data = json.loads(fixed_string)
        func_logger.info("Successfully loaded JSON data.")
        func_logger.debug(f"Parsed JSON data: {json.dumps(data, indent=2)}")

        extracted_fields = data.get("Extracted_fields", {})
        questionnaire_prompt = (
            data.get("Questionnaire_prompt") or data.get("Questionnaire_Prompt") or {}
        )
        func_logger.info("Extracted 'Extracted_fields' and 'Questionnaire_prompt' from JSON.")

        # Note: These are returned as JSON strings
        return json.dumps(extracted_fields, indent=2), json.dumps(questionnaire_prompt, indent=2)

    except json.JSONDecodeError as e:
        func_logger.error(f"JSON Decode Error: {e}", exc_info=True) # Log full traceback
        func_logger.error(f"Failed JSON string (first 500 chars):\n{cleaned_string[:500]}...")
        raise ValueError(f"Invalid JSON format received from LLM: {e}. Raw data starts with: {cleaned_string[:100]}")
    except Exception as e:
        # This catch-all should theoretically not be hit if JSONDecodeError is caught above
        # but it's here for robustness.
        func_logger.error(f"An unexpected error occurred during JSON processing in functions.py: {e}", exc_info=True)
        raise ValueError(f"Failed to process LLM response JSON due to unexpected error: {e}")
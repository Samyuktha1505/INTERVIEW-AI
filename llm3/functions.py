import fitz  # PyMuPDF
import json
import re
import logging

# Set logging level if needed (you can remove or move to main config)
logging.basicConfig(level=logging.INFO)

def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extracts text from all pages of a PDF file using PyMuPDF.
    """
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        return text.strip()
    except Exception as e:
        logging.error(f"Error extracting text from PDF: {e}")
        raise

def clean_json_string(raw_string: str) -> str:
    """
    Cleans a raw string by removing code block markers like ```json and triple backticks.
    """
    # Remove ```json ... ``` or ``` ... ``` blocks
    cleaned = re.sub(r'```(?:json)?\s*([\s\S]*?)\s*```', r'\1', raw_string)
    # Remove control characters like \x00-\x1F that break JSON parsing
    cleaned = re.sub(r'[\x00-\x1F\x7F]', '', cleaned)
    return cleaned.strip()

def extract_metrics_from_json(raw_string: str) -> dict:
    """
    Extracts and parses a JSON object containing interview metrics from LLM response.
    Tries to parse entire JSON, or a nested 'Metrics' object if available.
    """
    cleaned_string = clean_json_string(raw_string)

    try:
        # Use regex to extract JSON object if the string contains extra text
        match = re.search(r'\{.*\}', cleaned_string, re.DOTALL)
        if not match:
            raise ValueError("No valid JSON object found in response.")

        json_string = match.group(0)
        data = json.loads(json_string)

        # Return the 'Metrics' dictionary if it's nested, else return whole object
        if isinstance(data, dict) and "Metrics" in data:
            return data["Metrics"]
        return data
    except json.JSONDecodeError as e:
        logging.error(f"Failed to decode JSON from LLM response: {e}")
        raise ValueError(f"Invalid JSON format in LLM response: {e}")
    except Exception as e:
        logging.error(f"Unexpected error during JSON parsing: {e}")
        raise

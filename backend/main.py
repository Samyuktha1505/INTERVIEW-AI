from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch # Corrected import for clarity
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
import os
import tempfile
import logging
import datetime
import json # Import json to parse the strings back into dicts

# Assuming 'prompts.py' and 'functions.py' are in the same directory
from prompts import llm1_prompt
from functions import extract_text_from_pdf, process_and_extract_json_data

# Load environment variables from .env file
load_dotenv()

# --- Logging Configuration ---
logging.basicConfig(
    filename="api_errors.log",
    level=logging.ERROR, # Set to logging.INFO or logging.DEBUG during development for more verbose logs
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# --- Settings Management ---
class Settings(BaseSettings):
    gemini_api_key: str = os.getenv("GEMINI_API_KEY") # Get from environment variable
    environment: str = os.getenv("ENVIRONMENT", "development") # Default to development

    class Config:
        env_file = ".env" # Specify .env file for loading

settings = Settings()

# --- Gemini Client Initialization ---
# Ensure the API key is loaded. If not, raise a clear error.
if not settings.gemini_api_key:
    raise ValueError("GEMINI_API_KEY is not set in environment variables or .env file.")

client = genai.Client(api_key=settings.gemini_api_key)
model_id = "gemini-2.0-flash" # Consider making this configurable via settings if you use different models
google_search_tool = Tool(google_search=GoogleSearch())

# --- FastAPI Application Setup ---
app = FastAPI(title="Resume Analyzer API", version="1.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    # IMPORTANT: In production, replace "*" with your actual frontend domain(s)
    allow_origins=["*"], # For development, allows all origins. Restrict this in production!
    allow_credentials=True,
    allow_methods=["*"], # Allow all HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"], # Allow all headers
)

# --- API Endpoint for Resume Analysis ---
@app.post("/v1/analyze_resume/")
async def analyze_resume(
    resume: UploadFile = File(...),
    targetRole: str = Form(...),
    targetCompany: str = Form(...),
    yearsOfExperience: str = Form(...),
    currentDesignation: str = Form(...),
    sessioninterval: str = Form(None), # Optional parameter
    interviewType: str = Form(...)
):
    # Initialize tmp_file_path to None so it's always defined for the finally block
    tmp_file_path = None
    try:
        print(f"[{datetime.datetime.now()}] Received request for role: {targetRole}, company: {targetCompany}")
        print(f"File received: {resume.filename}, Content-Type: {resume.content_type}")

        if resume.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

        # Create a temporary file to save the uploaded PDF
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            content = await resume.read()
            if len(content) > 5 * 1024 * 1024: # 5 MB limit
                raise HTTPException(status_code=413, detail="File size exceeds 5MB. Max 5MB allowed.")
            tmp_file.write(content)
            tmp_file_path = tmp_file.name # Store the path for cleanup

        print(f"[{datetime.datetime.now()}] PDF saved temporarily at: {tmp_file_path}")

        # Extract text from the PDF
        try:
            resume_text = extract_text_from_pdf(tmp_file_path)
            if not resume_text.strip():
                raise HTTPException(status_code=400, detail="Could not extract text from the PDF. The PDF might be empty, scanned, or malformed.")
            print(f"[{datetime.datetime.now()}] Extracted {len(resume_text)} characters from resume.")
        except Exception as e:
            logging.error(f"Error extracting text from PDF '{resume.filename}': {e}", exc_info=True) # Log full traceback
            raise HTTPException(status_code=500, detail=f"Failed to process PDF: {e}")

        # Construct the prompt for the LLM
        prompt = llm1_prompt(
            resume_text,
            targetRole,
            targetCompany,
            yearsOfExperience,
            currentDesignation,
            sessioninterval, # <--- Added the missing comma here
            interviewType    # This is now the 7th argument passed
        )
        print(f"[{datetime.datetime.now()}] Generated LLM prompt (first 500 chars): {prompt[:500]}...") # For detailed debugging

        # Make Gemini API call
        response = None # Initialize response to None
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=prompt,
                config=GenerateContentConfig(
                    tools=[google_search_tool],
                    response_modalities=["TEXT"]
                )
            )
            # Basic check for empty candidates list (can happen if LLM fails to generate)
            if not response.candidates:
                raise ValueError("Gemini API returned no content candidates.")

        except Exception as api_error:
            logging.error(f"Gemini API call failed: {api_error}", exc_info=True) # Log full traceback
            # Raising 502 for upstream service issues
            raise HTTPException(status_code=502, detail=f"Gemini service temporarily unavailable or returned an error: {api_error}")

        # Extract full text response from Gemini
        full_response = ""
        try:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'text'):
                    full_response += part.text
            if not full_response.strip():
                raise ValueError("Gemini API returned empty text content.")
            print(f"[{datetime.datetime.now()}] Received full LLM response (length: {len(full_response)}).")
            print(f"Full LLM response: \n{full_response[:1000]}...") # For detailed debugging

        except Exception as e:
            logging.error(f"Error processing Gemini response structure: {e}", exc_info=True) # Log full traceback
            raise HTTPException(status_code=500, detail="Failed to parse LLM response structure.")


        # Save full response for trace/debug (optional, useful for understanding LLM output)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        response_filename = f"llm_response_{timestamp}.txt"
        try:
            with open(response_filename, "w", encoding="utf-8") as f:
                f.write(full_response)
            print(f"[{datetime.datetime.now()}] LLM response saved to {response_filename}")
        except Exception as e:
            logging.warning(f"Could not save LLM response to file {response_filename}: {e}")


        # Process and extract JSON output from the LLM's full response
        # process_and_extract_json_data now returns JSON strings. We need to parse them back.
        extracted_fields_json_str, questionnaire_prompt_json_str = None, None
        extracted_fields_dict = {}
        questionnaire_prompt_dict = {}

        try:
            extracted_fields_json_str, questionnaire_prompt_json_str = process_and_extract_json_data(full_response)

            # Parse the JSON strings back into Python dictionaries
            extracted_fields_dict = json.loads(extracted_fields_json_str)
            questionnaire_prompt_dict = json.loads(questionnaire_prompt_json_str)

            if not extracted_fields_dict: # Check if essential fields were extracted
                 raise ValueError("Could not extract expected JSON fields from LLM response (empty dictionary).")
            print(f"[{datetime.datetime.now()}] Successfully extracted and parsed JSON fields.")
            print(f"Extracted fields: {extracted_fields_dict}") # For detailed debugging
            print(f"Questionnaire prompt (first 200 chars): {str(questionnaire_prompt_dict)[:200]}...") # For detailed debugging
        except json.JSONDecodeError as e:
            logging.error(f"JSONDecodeError when parsing string from process_and_extract_json_data: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to parse JSON output from LLM: {e}")
        except ValueError as e: # Catch ValueErrors from process_and_extract_json_data or our checks
            logging.error(f"ValueError during JSON extraction/validation: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to extract structured data from LLM response. Error: {e}")
        except Exception as e:
            logging.error(f"General error processing/extracting JSON from LLM response: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred during LLM data processing: {e}")


        # Return the structured response
        return {
            "extracted_fields": extracted_fields_dict,
            "questionnaire_prompt": questionnaire_prompt_dict
        }

    # Catch specific HTTPExceptions that were raised intentionally
    except HTTPException as http_exc:
        logging.error(f"[{datetime.datetime.now()}] HTTPException: {http_exc.status_code} - {http_exc.detail}")
        raise http_exc # Re-raise it so FastAPI handles it correctly
    # Catch any other unexpected errors
    except Exception as e:
        logging.error(f"[{datetime.datetime.now()}] Unhandled Internal Server Error: {e}", exc_info=True) # exc_info=True logs traceback
        # Return a generic 500 error to the client for unhandled exceptions
        return JSONResponse(status_code=500, content={"error": "An unexpected internal server error occurred. Please try again later."})
    finally:
        # Ensure the temporary PDF file is deleted, regardless of success or failure
        if tmp_file_path and os.path.exists(tmp_file_path):
            try:
                os.remove(tmp_file_path)
                print(f"[{datetime.datetime.now()}] Cleaned up temporary file: {tmp_file_path}")
            except Exception as e:
                logging.error(f"Error cleaning up temporary file {tmp_file_path}: {e}")

# --- Uvicorn Server Runner ---
if __name__ == "__main__":
    import uvicorn
    # Host '0.0.0.0' makes it accessible from other devices on your network
    # reload=True is great for development, but remove in production
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
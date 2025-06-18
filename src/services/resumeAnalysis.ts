// --- Interfaces for API Response Structure ---
// These define the shape of the data we expect back from the backend.

export interface ExtractedFields {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  total_experience_years?: string;
  most_recent_company?: string;
  most_recent_role?: string;
  skills?: string[];
  education?: { degree: string; university: string; year: string }[];
  certifications?: string[];
  strengths?: string[];
  weaknesses?: string[];
  suitability_score_out_of_100?: number;
  fit_analysis?: string;
  graduation_college?: string;
  degree?: string;
  projects?: string[];
  current_company?: string;
  current_designation?: string;
  previous_companies?: string[];
  current_location?: string;
}

export interface Question {
  id: number;
  question: string;
  type: string;
}

// THIS IS THE INTERFACE THAT NEEDS TO CHANGE
// This interface now ONLY matches the JSON object returned by your main.py endpoint for /v1/analyze_resume/.
export interface ResumeAnalysisResponse {
  Questionnaire_prompt: Question[]; // Only include what the backend returns
}

// --- API Call Function ---

/**
 * Sends resume data to the backend for analysis.
 * @param {FormData} formData - The FormData object, pre-built in the calling component.
 * It must contain the resume file and all other required form fields.
 * @returns {Promise<ResumeAnalysisResponse>} A promise that resolves to the analysis result from the backend.
 */
export const analyzeResume = async (
  formData: FormData
): Promise<ResumeAnalysisResponse> => { // Use the updated interface here

  // --- DEBUGGING START ---
  console.log('--- analyzeResume Function Call Started ---');
  console.log('--- FormData Content Received (before fetch) ---');
  for (let pair of formData.entries()) {
    console.log(`  Key: "${pair[0]}", Value: ${pair[1] instanceof File ? pair[1].name : pair[1]}`);
  }
  console.log('------------------------------------');

  try {
    const apiEndpoint = 'http://localhost:8000/v1/analyze_resume/';
    console.log(`Attempting to send POST request to: ${apiEndpoint}`);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      body: formData,
    });

    console.log('Received HTTP Response Status:', response.status);
    console.log('Received HTTP Response OK Status (2xx):', response.ok);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Backend returned a non-OK response. Raw error body:', errorBody);

      let errorMessage = `Resume analysis failed: ${response.statusText} (${response.status})`;

      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.detail) {
          errorMessage = `Resume analysis failed: ${errorJson.detail}`;
        } else {
          errorMessage = `Resume analysis failed: ${JSON.stringify(errorJson, null, 2)}`;
        }
      } catch (e) {
        console.warn('Could not parse error response as JSON. Using raw text.');
        errorMessage = `Resume analysis failed: ${response.statusText}. Response: ${errorBody.substring(0, 200)}...`;
      }
      console.error('Final error message to be thrown:', errorMessage);
      throw new Error(errorMessage);
    }

    const jsonResponse: ResumeAnalysisResponse = await response.json(); // Cast to the updated interface
    console.log('Successfully received JSON response from backend:', jsonResponse);
    console.log('--- analyzeResume Function Call Finished (Success) ---');

    return jsonResponse;

  } catch (err: any) {
    console.error('An error occurred during the fetch operation or subsequent processing:', err);
    console.log('--- analyzeResume Function Call Finished (Error) ---');
    throw new Error(err.message || "An unknown network or processing error occurred during resume analysis.");
  }
};
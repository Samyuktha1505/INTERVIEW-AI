// frontend/services/resumeAnalysis.ts

// --- Interfaces for Request and Response ---

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
  // Add other extracted fields you expect from your LLM prompt
}

export interface Question {
  id: number;
  question: string;
  type: string;
}

// Updated ResumeAnalysisResponse to match backend output structure from main.py
export interface ResumeAnalysisResponse {
  extracted_fields: ExtractedFields;
  questionnaire_prompt: Question[];
}

export interface ResumeAnalysisRequest {
  resume: File;
  targetRole: string;
  targetCompany: string;
  yearsOfExperience: string; // Keep as string as per your form data flow
  currentDesignation: string;
  sessioninterval?: number; // Optional number type
  interviewType: string;
}

// --- API Call Function ---

export const analyzeResume = async (
  data: ResumeAnalysisRequest // This 'data' object is what's passed from InterviewRoom.tsx
): Promise<ResumeAnalysisResponse> => {

  // --- DEBUGGING START ---
  console.log('--- analyzeResume Function Call Started ---');
  console.log('Input data received by analyzeResume:', data);
  console.log('  -> Resume File:', data.resume ? data.resume.name : 'No file object');
  console.log('  -> Target Role:', data.targetRole);
  console.log('  -> Target Company:', data.targetCompany);
  console.log('  -> Years of Experience:', data.yearsOfExperience);
  console.log('  -> Current Designation:', data.currentDesignation);
  console.log('  -> Interview Type:', data.interviewType); // Crucial for your current issue
  console.log('  -> Session Interval:', data.sessioninterval);

  const formData = new FormData();
  formData.append('resume', data.resume);
  formData.append('targetRole', data.targetRole);
  formData.append('targetCompany', data.targetCompany);
  formData.append('yearsOfExperience', data.yearsOfExperience);
  formData.append('currentDesignation', data.currentDesignation);
  formData.append('interviewType', data.interviewType); // Appending interviewType

  // CRUCIAL FIX: Changed 'Session_Interval' to 'sessioninterval'
  // This matches the form field name expected by your FastAPI backend's `Form` parameter.
  if (data.sessioninterval !== undefined && data.sessioninterval !== null) {
    formData.append('sessioninterval', data.sessioninterval.toString());
  }

  // --- Inspect FormData Content Before Sending ---
  console.log('--- FormData Content (before fetch) ---');
  // Iterate over formData entries to see what will actually be sent
  for (let pair of formData.entries()) {
    // Note: For files, pair[1] will be the File object itself, not its content.
    console.log(`  Key: "${pair[0]}", Value: ${pair[1] instanceof File ? pair[1].name : pair[1]}`);
  }
  console.log('------------------------------------');


  try {
    const apiEndpoint = 'http://localhost:8000/v1/analyze_resume/';
    console.log(`Attempting to send POST request to: ${apiEndpoint}`);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      body: formData, // FormData automatically sets Content-Type to multipart/form-data
    });

    console.log('Received HTTP Response Status:', response.status);
    console.log('Received HTTP Response OK Status (2xx):', response.ok);


    if (!response.ok) {
      const errorBody = await response.text(); // Get raw text to handle various error formats
      console.error('Backend returned a non-OK response. Raw error body:', errorBody);

      let errorMessage = `Resume analysis failed: ${response.statusText} (${response.status})`;

      try {
        const errorJson = JSON.parse(errorBody);
        // Prioritize a 'detail' field from FastAPI errors
        if (errorJson.detail) {
          errorMessage = `Resume analysis failed: ${errorJson.detail}`;
        } else {
          // If no 'detail' but it's valid JSON, stringify it for clarity
          errorMessage = `Resume analysis failed: ${JSON.stringify(errorJson, null, 2)}`;
        }
      } catch (e) {
        // If parsing as JSON fails, use the raw text body
        console.warn('Could not parse error response as JSON. Using raw text.');
        errorMessage = `Resume analysis failed: ${response.statusText}. Response: ${errorBody.substring(0, 200)}...`; // Truncate for console readability
      }
      console.error('Final error message to be thrown:', errorMessage);
      throw new Error(errorMessage);
    }

    // If response.ok is true, parse as JSON
    const jsonResponse = await response.json();
    console.log('Successfully received JSON response from backend:', jsonResponse);
    console.log('--- analyzeResume Function Call Finished (Success) ---');

    return jsonResponse;

  } catch (err: any) {
    console.error('An error occurred during the fetch operation or subsequent processing:', err);
    console.log('--- analyzeResume Function Call Finished (Error) ---');
    // Re-throw the error with a useful message
    throw new Error(err.message || "An unknown network or processing error occurred during resume analysis.");
  }
};
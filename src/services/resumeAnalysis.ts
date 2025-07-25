// src/services/resumeAnalysis.ts
import apiClient from '../api/httpClient';

export interface AnalysisRequestPayload {
  targetRole: string;
  targetCompany: string;
  yearsOfExperience: string;
  currentDesignation: string;
  interviewType: string;
  sessionInterval?: number;
}

export interface Question {
  id: number;
  question: string;
  type: string;
}

export interface ResumeAnalysisResponse {
  interview_id: string;
  Questionnaire_prompt: Question[];

  resume_summary: {
    skills?: string[];
    certifications?: string[];
    projects?: string[];
    previous_companies?: string[];
    graduation_college?: string;
    current_role?: string;
    current_company?: string;
    current_location?: string;
  };

  input_metadata: {
    target_role: string;
    target_company: string;
    years_of_experience: number;
    interview_type: string;
    session_interval: number;
  };

  user_details: {
    full_name?: string;
  };
}


/**
 * Sends interview context data to the backend for generating questions.
 * session_id is passed as a path parameter.
 * @param {string} sessionId - The unique session identifier.
 * @param {AnalysisRequestPayload} payload - Interview context data.
 * @returns {Promise<ResumeAnalysisResponse>} - The generated questionnaire.
 */
export const analyzeResume = async (
  payload: AnalysisRequestPayload
): Promise<ResumeAnalysisResponse> => {
  console.log('--- analyzeResume Function Call Started (without resume file) ---');
  console.log('Payload:', payload);
  console.log('------------------------------------');

  try {
    const response = await apiClient.post<ResumeAnalysisResponse>(
      `/api/v1/resume/analyze_resume`,
      payload
    );

    console.log('Successfully received API response:', response.data);
    return response.data;

  } catch (err: any) {
    console.error('Error during API call:', err);

    let errorMessage = "An unknown error occurred during resume analysis.";
    if (err.response) {
      if (err.response.data?.detail) {
        errorMessage = `Resume analysis failed: ${err.response.data.detail}`;
      } else if (err.response.status) {
        errorMessage = `Resume analysis failed: Status ${err.response.status} - ${err.response.statusText}`;
      }
    } else if (err.request) {
      errorMessage = "No response from server. Please check your network or backend status.";
    } else {
      errorMessage = err.message || errorMessage;
    }

    throw new Error(errorMessage);
  }
};

import apiClient from '../api/httpClient'; // Axios instance with cookies

const API_BASE_URL = 'http://localhost:8000';

// -----------------------------
// Interfaces
// -----------------------------

interface CompletionSession {
  session_id: string;
  is_completed: boolean;
  transcription: string | null;
}

interface CompletionResponse {
  sessions: CompletionSession[];
}

interface ResumeAnalysisData {
  targetRole: string;
  targetCompany: string;
  yearsOfExperience: string;
  currentDesignation: string;
  interviewType: string;
  sessionInterval?: string;
}

interface ResumeAnalysisResponse {
  Questionnaire_prompt: any;
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

interface ApiRequestOptions {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  retries?: number;
  retryDelay?: number;
}

interface StartSessionResponse {
  session_id: string;
}

// -----------------------------
// Utility Functions
// -----------------------------

function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

function redirectToLogin(): never {
  window.location.href = '/login';
  throw new Error('Redirecting to login');
}

async function handleApiError(response: Response): Promise<never> {
  if (response.status === 401) {
    redirectToLogin();
  }

  try {
    const errorData = await response.json() as { detail?: string; message?: string };
    const errorMessage = errorData.detail || errorData.message || `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  } catch {
    throw new Error(`Request failed with status ${response.status}`);
  }
}

// -----------------------------
// Generic API Request with fetch (cookies included)
// -----------------------------

export const apiRequest = async <T = any>({
  endpoint,
  method,
  body,
  retries = 1,
  retryDelay = 1000
}: ApiRequestOptions): Promise<T> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: getAuthHeaders(),
        credentials: 'include', // ✅ Send cookies
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        return await handleApiError(response);
      }

      return await response.json() as T;

    } catch (error) {
      if (attempt === retries) {
        console.error(`❌ API request to ${endpoint} failed after ${retries} attempts:`, error);
        throw error;
      }

      const delay = retryDelay * Math.pow(2, attempt); // exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected error in apiRequest');
};

// -----------------------------
// API Functions
// -----------------------------

/**
 * ✅ Check which sessions are completed (AFTER session creation only)
 */
export const checkCompletedSessions = async (
  sessionIds: string[]
): Promise<Set<string>> => {
  console.log("✅ checkCompletedSessions() called with sessionIds:", sessionIds);

  // 1️⃣ Validate input
  if (
    !Array.isArray(sessionIds) ||
    sessionIds.length === 0 ||
    sessionIds.some(id => typeof id !== 'string')
  ) {
    console.warn("⚠️ Skipping checkCompletedSessions: invalid session IDs", sessionIds);
    return new Set();
  }
  console.log("✅ Valid session IDs received");

  // 2️⃣ Make API request
  const requestBody = { session_ids: sessionIds };
  console.log("📡 Sending POST request to /api/v1/sessions/check-completion with body:", requestBody);

  const data = await apiRequest<CompletionResponse>({
    endpoint: '/api/v1/sessions/check-completion',
    method: 'POST',
    body: requestBody,
  });
  console.log("✅ Response from check-completion:", data);

  // 3️⃣ Filter completed sessions
  const completed = data.sessions.filter(session => session.is_completed);
  console.log("✅ Filtered completed sessions:", completed);

  // 4️⃣ Extract session IDs of completed sessions into a Set
  const completedSet = new Set(completed.map(session => session.session_id));
  console.log("✅ Returning completed session IDs Set:", completedSet);

  return completedSet;
};


/**
 * ✅ Analyze resume for given session metadata
 */
export const analyzeResume = async (
  analysisData: ResumeAnalysisData
): Promise<ResumeAnalysisResponse> => {
  const response = await apiClient.post<ResumeAnalysisResponse>(
    '/api/v1/resume/analyze_resume',
    analysisData,
    { withCredentials: true } // ✅ Axios with cookie support
  );
  return response.data;
};

/**
 * ✅ Summarize transcript and save
 */
export const summarizeAndSaveTranscript = async (
  sessionId: string,
  transcript: string
): Promise<any> => {
  try {
    const response = await apiClient.post(
      `/api/v1/sessions/${sessionId}/summarize`,
      { transcript },
      { withCredentials: true } // ✅ Axios with cookie support
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(response.data?.detail || 'Failed to summarize transcript.');
    }

    return response.data;
  } catch (error: any) {
    console.error('Error in summarizeAndSaveTranscript:', error);
    if (error.response) {
      throw new Error(error.response.data.detail || 'Unknown error occurred.');
    }
    throw error;
  }
};

/**
 * ✅ Create a new interview session
 */
export const createInterviewSession = async (
  interviewId: string | number
): Promise<string> => {
  const data = await apiRequest<StartSessionResponse>({
    endpoint: '/api/v1/sessions/start',
    method: 'POST',
    body: { interview_id: interviewId },
  });
  return data.session_id;
};

/**
 * Fetch the latest session_id for a given interview_id
 */
export const fetchLatestSessionId = async (
  interviewId: string | number
): Promise<string> => {
  const data = await apiRequest<{ session_id: string }>({
    endpoint: `/api/v1/sessions/latest/${interviewId}`,
    method: 'GET',
  });
  return data.session_id;
};

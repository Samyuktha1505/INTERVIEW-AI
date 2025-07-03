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
  session_id: string;
  targetRole: string;
  targetCompany: string;
  yearsOfExperience: string;
  currentDesignation: string;
  interviewType: string;
  sessionInterval?: string;
}

interface ResumeAnalysisResponse {
  Questionnaire_prompt: any;
}

interface ApiRequestOptions {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  retries?: number;
  retryDelay?: number;
}

// -----------------------------
// Utility Functions
// -----------------------------

function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json'
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
// Generic API Request
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
        credentials: 'include', // Include cookies for auth
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
 * ✅ Check which sessions are completed
 */
export const checkCompletedSessions = async (
  roomIds: string[]
): Promise<Set<string>> => {
  const data = await apiRequest<CompletionResponse>({
    endpoint: '/api/v1/sessions/check-completion',
    method: 'POST',
    body: { session_ids: roomIds },
  });

  const completed = data.sessions.filter(session => session.is_completed);
  return new Set(completed.map(session => session.session_id));
};

/**
 * ✅ Analyze resume for given session metadata
 */
export const analyzeResume = async (
  analysisData: ResumeAnalysisData
): Promise<ResumeAnalysisResponse> => {
  return apiRequest<ResumeAnalysisResponse>({
    endpoint: '/api/v1/resume/analyze_resume',
    method: 'POST',
    body: analysisData,
  });
};

export const summarizeAndSaveTranscript = async (sessionId: string, transcript: string): Promise<any> => {
  console.log(`[summarizeAndSaveTranscript] Sending transcript for session ${sessionId}. Length: ${transcript.length}`);
  try {
    const response = await httpClient.post(`/api/v1/sessions/${sessionId}/summarize`, {
      transcript: transcript,
    });
    
    console.log(`[summarizeAndSaveTranscript] Response status: ${response.status}`);
    const responseData = await response.json();
    console.log('[summarizeAndSaveTranscript] Response data:', responseData);

    if (!response.ok) {
      console.error('[summarizeAndSaveTranscript] Response not OK.', responseData);
      throw new Error(responseData.detail || 'Failed to summarize transcript.');
    }
    return responseData;
  } catch (error) {
    console.error('Error in summarizeAndSaveTranscript service call:', error);
    throw error;
  }
};

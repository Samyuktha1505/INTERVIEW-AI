const API_BASE_URL = 'http://localhost:8000';

interface CompletionResponse {
  completed_ids: string[];
}

// No longer need Authorization headers if using HTTP-only cookies
function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json'
  };
}

// Error handler remains the same
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

function redirectToLogin(): never {
  window.location.href = '/login';
  throw new Error('Redirecting to login');
}

interface ApiRequestOptions {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  retries?: number;
  retryDelay?: number;
}

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
        credentials: 'include', // crucial for sending cookies
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        return await handleApiError(response);
      }

      return await response.json() as T;
    } catch (error) {
      if (attempt === retries) {
        console.error(`API request to ${endpoint} failed after ${retries} attempts:`, error);
        throw error;
      }

      const delay = retryDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected error in apiRequest');
};

export const checkCompletedSessions = async (roomIds: string[]): Promise<Set<string>> => {
  const res = await fetch("http://localhost:8000/api/v1/sessions/check-completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ session_ids: roomIds }),
  });

  if (!res.ok) {
    throw new Error("Failed to check session completion");
  }

  const data = await res.json();
  const completed = data.sessions.filter((s: any) => s.is_completed);
  return new Set(completed.map((s: any) => s.session_id));
};

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

export const analyzeResume = async (
  analysisData: ResumeAnalysisData
): Promise<ResumeAnalysisResponse> => {
  return apiRequest<ResumeAnalysisResponse>({
    endpoint: '/api/v1/resume/analyze_resume',
    method: 'POST',
    body: analysisData
  });
};

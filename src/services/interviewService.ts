// This service talks to your MAIN backend server
const API_BASE_URL = 'http://localhost:8000'; 

interface CompletionResponse {
  completed_ids: string[];
}

export const checkCompletedSessions = async (sessionIds: string[]): Promise<Set<string>> => {
  if (sessionIds.length === 0) {
    return new Set();
  }
  try {
    const response = await fetch(`${API_BASE_URL}/v1/sessions/check-completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_ids: sessionIds }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to check session statuses');
    }
    const data: CompletionResponse = await response.json();
    return new Set(data.completed_ids);
  } catch (error) {
    console.error("Error in checkCompletedSessions service:", error);
    return new Set();
  }
};
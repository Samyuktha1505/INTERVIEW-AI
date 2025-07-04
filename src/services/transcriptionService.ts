const API_BASE_URL = 'http://localhost:8000/api';

interface SaveResponse {
  status: string;
  message: string;
}

export const saveTranscription = async (sessionId: string, transcriptionText: string): Promise<SaveResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/transcriptions/transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        session_id: sessionId,
        transcription_text: transcriptionText,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to save transcription');
    }

    return await response.json();
  } catch (error) {
    console.error("Error in saveTranscription service:", error);
    throw error;
  }
};
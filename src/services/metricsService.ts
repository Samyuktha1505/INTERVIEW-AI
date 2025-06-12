const API_BASE_URL = 'http://localhost:8001'; // NOTE: This uses port 8001

// This interface should match the structure of the 'Metrics' object in your Python code
export interface Metrics {
  technical_score: number;
  communication_score: number;
  suspicious_flag: boolean;
  insights: string;
}

interface MetricsResponse {
  metrics: Metrics;
}

export const generateAndFetchMetrics = async (sessionId: string): Promise<Metrics> => {
  try {
    // We use a POST request as it triggers a creation/analysis process on the backend
    const response = await fetch(`${API_BASE_URL}/v1/metrics/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to generate metrics');
    }

    const data: MetricsResponse = await response.json();
    return data.metrics;
  } catch (error) {
    console.error("Error in generateAndFetchMetrics service:", error);
    throw error;
  }
};
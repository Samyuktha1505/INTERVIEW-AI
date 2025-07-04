const API_BASE_URL = 'http://localhost:8000/api'; // NOTE: This uses port 8000

// This interface should match the structure of the 'Metrics' object returned by the FastAPI backend
export interface Metrics {
  technical_rating: number;
  communication_rating: number;
  problem_solving_rating: number;
  overall_rating: number;
  remarks: string;
  suspicious_flag: boolean;
}

interface MetricsResponse {
  metrics: Metrics;
}

/**
 * Triggers backend metric generation and returns the resulting metrics.
 * 
 * @param sessionId - Unique identifier for the interview session.
 * @returns Metrics - The structured performance data.
 * @throws Error if request fails or backend returns an error.
 */
export const generateAndFetchMetrics = async (sessionId: string): Promise<Metrics> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/metrics/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
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

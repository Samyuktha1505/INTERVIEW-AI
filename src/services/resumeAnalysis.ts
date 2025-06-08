
export interface ResumeAnalysisRequest {
  resume: File;
  targetRole: string;
  targetCompany: string;
  yearsOfExperience: string;
}

export interface ResumeAnalysisResponse {
  analysis: string;
  suggestions?: string[];
  score?: number;
  [key: string]: any; // Allow for additional fields from your API
}

export const analyzeResume = async (data: ResumeAnalysisRequest): Promise<ResumeAnalysisResponse> => {
  const formData = new FormData();
  formData.append('resume', data.resume);
  formData.append('Target_Role', data.targetRole);
  formData.append('Target_Company', data.targetCompany);
  formData.append('Years_of_Experience', data.yearsOfExperience);

  const response = await fetch('https://e50a-223-185-129-202.ngrok-free.app/v1/analyze_resume/', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Resume analysis failed: ${response.statusText}`);
  }

  return response.json();
};

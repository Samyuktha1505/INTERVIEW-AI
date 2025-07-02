export async function fetchResumeUrl(): Promise<string | null> {
    const response = await fetch('http://localhost:8000/api/v1/auth/user-profile', { credentials: 'include' });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data?.user?.resume_url || null;
  }
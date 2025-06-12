def generate_metrics_prompt(transcript_text: str) -> str:
    """
    Creates a prompt to generate performance metrics from an interview transcript.
    """
    prompt = f"""
    You are an expert Interview Analyst and Talent Acquisition Specialist. Your task is to analyze the following interview transcript and provide a structured JSON output containing performance metrics.

    Analyze the entire conversation between the "AGENT" (the interviewer) and the "USER" (the candidate).

    <Transcript>
    {transcript_text}
    </Transcript>

    Based on the transcript, provide the following metrics in a strict JSON format. Do not include any explanatory text outside of the JSON block.

    1.  technical_rating: A score from 0.00 to 10.00 representing the candidate's technical skills and knowledge.
    2.  communication_rating: A score from 0.00 to 10.00 evaluating the candidate's clarity, confidence, and articulation.
    3.  problem_solving_rating: A score from 0.00 to 10.00 based on logical reasoning and problem-solving approach.
    4.  overall_rating: A score from 0.00 to 10.00 representing the candidate's overall interview performance.
    5.  remarks: A brief summary (2–3 sentences) highlighting the candidate’s strengths and areas of improvement.
    6.  suspicious_flag: A boolean (true/false) indicating if any signs of suspicious behavior or cheating were observed (e.g., irrelevant or unusually fast responses, inconsistency in answers).

    OUTPUT FORMAT:
    ```json
    {{
        "Metrics": {{
            "technical_rating": 0.0,
            "communication_rating": 0.0,
            "problem_solving_rating": 0.0,
            "overall_rating": 0.0,
            "remarks": "",
            "suspicious_flag": false
        }}
    }}
    ```
    """
    return prompt

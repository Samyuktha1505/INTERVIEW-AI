def generate_metrics_prompt(transcript_text: str) -> str:
    """
    Creates a prompt to generate interview metrics from a transcript.
    """
    prompt = f"""
    You are an expert Interview Analyst and Talent Acquisition Specialist. Your task is to analyze the following interview transcript and provide a structured JSON output containing specific metrics.

    Analyze the entire conversation between the "AGENT" (the interviewer) and the "USER" (the candidate).

    <Transcript>
    {transcript_text}
    </Transcript>

    Based on the transcript, provide the following metrics in a strict JSON format. Do not include any explanatory text outside of the JSON block.

    1.  **technical_score**: A score from 0.00 to 5.00 representing the candidate's technical knowledge, problem-solving skills, and clarity of technical explanations.
    2.  **communication_score**: A score from 0.00 to 5.00 evaluating the candidate's clarity, confidence, and professionalism in communication.
    3.  **suspicious_flag**: A boolean value (true or false). Set to true only if there is strong evidence of cheating, such as looking away consistently to read answers, receiving external help, or extremely long, unnatural pauses before answering simple questions. Otherwise, set to false.
    4.  **insights**: A detailed text analysis (2-3 paragraphs) summarizing the candidate's strengths, weaknesses, and overall performance. Provide specific examples from the transcript to support your analysis.

    OUTPUT FORMAT:
    ```json
    {{
        "Metrics": {{
            "technical_score": <float>,
            "communication_score": <float>,
            "suspicious_flag": <boolean>,
            "insights": "<string>"
        }}
    }}
    ```
    """
    return prompt
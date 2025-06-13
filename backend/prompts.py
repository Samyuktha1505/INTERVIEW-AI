def llm1_prompt(
    resume_text: str,
    target_role: str,
    target_company: str,
    years_of_experience: str,
    current_designation: str,
    session_interval: str,
    interview_type: str
) -> str:
    """
    Generates a prompt for the LLM to analyze a resume and create interview questions.
    """
    question_type_instruction = ""
    if interview_type and interview_type.lower() != "general":
        question_type_instruction = (
            f"All interview questions should be of the **{interview_type}** type. "
            f"Do not include questions of other types. "
        )
    else:
        question_type_instruction = (
            "The interview questionnaire should include Technical, Behavioral, Situational, and Project-based questions. "
            "Categorize them accordingly."
        )

    prompt = f"""
        You are an Expert Technical Recruiter specializing in {target_role} positions at {target_company}. Your task is to:

        1.  **Extract Candidate Information**: From the provided resume, parse the details into the "Extracted_fields" JSON object.
            <Resume>
            {resume_text}
            </Resume>

        2.  **Generate Interview Questionnaire**: Based on the resume, create a comprehensive questionnaire.
            {question_type_instruction}
            Ensure all questions are highly tailored to the candidate's background and the specific role.

        3.  **Output Format**: Your entire response MUST be a single, parsable JSON string with two top-level keys: "Extracted_fields" and "Questionnaire_prompt".

            "Extracted_fields" should be a JSON object containing fields like "name", "email", "skills", "projects", etc.

            "Questionnaire_prompt" should be a JSON array of question objects, each with "id", "question", and "type".

            Example of the overall JSON structure:
            ```json
            {{
                "Extracted_fields": {{ "name": "John Doe", "email": "john.doe@example.com", ... }},
                "Questionnaire_prompt": [
                    {{ "id": 1, "question": "...", "type": "{interview_type}" }},
                    {{ "id": 2, "question": "...", "type": "{interview_type}" }}
                ]
            }}
            ```
            Your output should only be the JSON object, without any markdown delimiters.
        """
    return prompt


def generate_metrics_prompt(transcript_text: str) -> str:
    """
    Creates a prompt to generate performance metrics from an interview transcript.
    (This is the updated version from the llm3 folder)
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

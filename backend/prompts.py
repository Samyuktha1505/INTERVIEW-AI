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
    Generates a prompt to analyze an interview transcript and create performance metrics.
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
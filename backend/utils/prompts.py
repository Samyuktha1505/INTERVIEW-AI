# prompts.py

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
    Updated: Aligned Extracted_fields to match the provided Resume table schema.
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

        2.  **Generate Interview Questionnaire**: Based on the candidate's resume, their current designation of '{current_designation}', their {years_of_experience} years of experience, and the target role of '{target_role}' at '{target_company}', create a comprehensive interview questionnaire.
            {question_type_instruction}
            Ensure all questions are highly tailored to the candidate's background and the specific role.

        3.  **Output Format**: Your entire response MUST be a single, parsable JSON string with **two** top-level keys: "Extracted_fields" and "Questionnaire_prompt".

            "Extracted_fields" should be a JSON object containing the following fields, directly mapping to the database schema:
            "full_name", "email_address", "mobile_number", "graduation_college",
            "education_degree", "certifications", "skills", "projects", "current_company",
            "previous_companies", "current_location", "current_role", "work_experience".
            Please map these from the resume content:
            - "full_name": Full name of the candidate.
            - "email_address": Candidate's email address.
            - "mobile_number": Candidate's phone number.
            - "graduation_college": The name of the candidate's primary or most recent graduating college/university.
            - "education_degree": The candidate's primary or most recent degree (e.g., "B.Tech in Computer Science").
            - "certifications": A comma-separated string or array of professional certifications.
            - "skills": A comma-separated string or array of key technical and soft skills.
            - "projects": A comma-separated string or array of notable projects, including brief descriptions if possible.
            - "current_company": The name of the candidate's current employer.
            - "previous_companies": A comma-separated string or array of names of previous employers.
            - "current_location": Candidate's current city and state/country.
            - "current_role": The candidate's current job title.
            - "work_experience": A textual summary of the candidate's overall work experience, including duration and key responsibilities/achievements.

            "Questionnaire_prompt" should be a JSON array of question objects, each with "id" (a unique number), "question" (the actual question string), and "type" (e.g., "Technical", "Behavioral", "Situational", "Project-based", or the specific interviewType if provided).

            Your output should only be the JSON object, without any markdown delimiters.
        """
    return prompt

def generate_metrics_prompt(transcript_text: str) -> str:
    """
    Generates a prompt for the LLM to evaluate a candidate's interview performance
    based on the transcript and provide a score and remarks.
    """
    prompt = f"""
    You are an expert interviewer and evaluator. Analyze the following interview transcript
    and provide a detailed assessment of the candidate's performance across key areas.

    Transcript:
    <Transcript>
    {transcript_text}
    </Transcript>

    Your assessment should be formatted as a single JSON object with the following keys:
    - "technical_rating": An integer rating from 1 to 5 (1 = Poor, 5 = Excellent) on technical knowledge and problem-solving.
    - "communication_rating": An integer rating from 1 to 5 on clarity, coherence, and conciseness of communication.
    - "problem_solving_rating": An integer rating from 1 to 5 on their approach to solving problems, logical thinking, and creativity.
    - "overall_rating": An integer rating from 1 to 5 representing the overall performance.
    - "remarks": A concise textual summary (max 3-4 sentences) highlighting the candidate's strengths, weaknesses, and areas for improvement.
    - "suspicious_flag": A boolean (true/false) indicating if there's any suspicion of AI assistance, cheating, or dishonesty during the interview (e.g., overly perfect answers, lack of natural hesitation, inconsistencies). Set to true ONLY if strong indications are present.

    Example Output:
    ```json
    {{
      "technical_rating": 4,
      "communication_rating": 3,
      "problem_solving_rating": 4,
      "overall_rating": 4,
      "remarks": "The candidate demonstrated strong technical knowledge in algorithms and data structures. Communication was generally clear but could be more concise. Showed a good structured approach to problem-solving. Needs to work on explaining complex ideas simply.",
      "suspicious_flag": false
    }}
    ```
    Ensure your output is only the JSON object, without any surrounding text or markdown.
    """
    return prompt
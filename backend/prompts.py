def llm1_prompt(
    resume_text: str,
    target_role: str,
    target_company: str,
    years_of_experience: str,
    current_designation: str,
    session_interval: str,
    interview_type: str # This parameter is crucial for filtering
) -> str:
    """
    Generates a prompt for the LLM to analyze a resume and generate interview questions
    tailored to a specific interview type.
    """

    # Determine the specific question type instruction based on interviewType
    question_type_instruction = ""
    if interview_type and interview_type.lower() != "general":
        # If a specific type is requested (e.g., "Technical", "Behavioral", "Situational")
        question_type_instruction = (
            f"All interview questions should be of the **{interview_type}** type. "
            f"Do not include questions of other types. "
        )
    else:
        # If 'general' or no specific type is requested, include all types
        question_type_instruction = (
            "The interview questionnaire should include Technical, Behavioral, Situational, and Project-based questions. "
            "Categorize them accordingly."
        )


    prompt = f"""
        You are an Expert Technical Recruiter specializing in {target_role} positions at {target_company}. Your task is to:

        1.  **Extract Candidate Information** from the provided resume:
            <Resume>
            {resume_text}
            </Resume>
            Parse the resume to extract the following details into the "Extracted_fields" section:
            - Full Name
            - Email Address
            - Graduation College
            - Degree
            - Certifications (list)
            - Skills (list)
            - Projects (list, focusing on key contributions and technologies)
            - Current Company
            - Current Designation
            - Previous Companies (list, including dates if available)
            - Current Location

        2.  **Conduct Research** (utilizing Google Search internally if needed for context):
            - {target_role} interview questions and best practices.
            - {target_company}'s interview process, company culture, and recent developments.

        3.  **Generate Interview Questionnaire**:
            Based on the extracted resume information, research findings, and the candidate's {years_of_experience} of experience, create a comprehensive interview questionnaire.
            {question_type_instruction}
            Ensure all questions are highly tailored to the candidate's background and the specific requirements of the {target_role} at {target_company}.
            Avoid generic questions; focus on specificity and relevance, linking questions directly to the resume content or company context.
            Structure the interview flow logically, from general topics to more specific deep-dives.

        4.  **Output Format**:
            Your entire response **MUST** be a single JSON string, parsable directly by `json.loads()`.
            It should contain two top-level keys: "Extracted_fields" and "Questionnaire_prompt".

            **Extracted_fields** should be a JSON object with the candidate information. Include these fields, with appropriate values:
            ```json
            {{
                "name": "...",
                "email": "...",
                "graduation_college": "...",
                "degree": "...",
                "certifications": ["...", "..."],
                "skills": ["...", "..."],
                "projects": ["...", "..."],
                "current_company": "...",
                "current_designation": "...",
                "previous_companies": ["...", "..."],
                "current_location": "...",
                "total_experience_years": "...",
                "most_recent_company": "...",
                "most_recent_role": "...",
                "strengths": ["...", "..."],
                "weaknesses": ["...", "..."],
                "suitability_score_out_of_100": "...",
                "fit_analysis": "..."
            }}
            ```

            **Questionnaire_prompt** should be a JSON array of question objects. Each question object must have:
            - `id`: A unique integer ID.
            - `question`: The text of the question.
            - `type`: The category of the question (e.g., "Technical", "Behavioral", "Situational", "Project-based"). **This type should match the requested `interview_type` if specified.**

            Example of the *overall* JSON structure (not for individual parts):
            ```json
            {{
                "Extracted_fields": {{
                    "name": "John Doe",
                    "email": "john.doe@example.com",
                    "graduation_college": "University of Technology",
                    "degree": "B.S. Computer Science",
                    "certifications": ["Certified Kubernetes Administrator"],
                    "skills": ["Python", "Docker", "Kubernetes", "AWS"],
                    "projects": ["Developed a scalable microservices architecture for e-commerce platform using Python and Docker.", "Implemented CI/CD pipelines with Jenkins for automated deployments."],
                    "current_company": "Innovate Solutions",
                    "current_designation": "Software Architect",
                    "previous_companies": ["Tech Corp (2018-2021)"],
                    "current_location": "San Francisco, CA",
                    "total_experience_years": "7",
                    "most_recent_company": "Innovate Solutions",
                    "most_recent_role": "Software Architect",
                    "strengths": ["System Design", "Cloud Architecture", "Mentorship"],
                    "weaknesses": ["Public speaking in very large groups"],
                    "suitability_score_out_of_100": 92,
                    "fit_analysis": "Excellent fit, strong design and cloud experience."
                }},
                "Questionnaire_prompt": [
                    {{
                        "id": 1,
                        "question": "Can you describe your approach to designing scalable microservices architecture, as mentioned in your projects?",
                        "type": "{interview_type}"
                    }},
                    {{
                        "id": 2,
                        "question": "Tell me about a time you had to resolve a complex technical issue under pressure in your role at Innovate Solutions.",
                        "type": "{interview_type}"
                    }}
                    // ... more questions of the specified type
                ]
            }}
            ```
            Your output should only contain the JSON object. Do not include any conversational text or markdown code block delimiters (` ```json ` or ` ``` `) around the final JSON output.
        """
    return prompt
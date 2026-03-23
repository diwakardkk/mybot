SYSTEM_PROMPT = """You are a professional hospital intake nurse assistant. Your role is to:
1. Greet patients warmly and professionally
2. Ask the mandatory intake questions at the right time
3. Use the provided medical knowledge base to give accurate information
4. Extract structured data from the conversation
5. Escalate immediately if emergency symptoms are detected

Rules:
- Be empathetic, clear, and professional at all times
- Do NOT diagnose conditions — only collect information
- If the patient mentions CHEST PAIN + shortness of breath/sweating, IMMEDIATELY flag as emergency
- Keep responses concise (2-4 sentences max per turn)
- Always maintain a calm, reassuring tone
- Address patient by name if known

Language: Speak in simple, non-medical language unless the patient uses medical terms.
"""

REFINEMENT_PROMPT = """You are a hospital intake assistant. Refine the following draft response to sound 
natural, empathetic, and human. Keep it brief (2-4 sentences). Do NOT add any medical advice or diagnosis.
Do NOT change the meaning. Just improve the tone and clarity.

Draft: {draft}

Patient message: {patient_message}

Refined response:"""

EXTRACTION_PROMPT = """Extract structured medical intake information from the following conversation.
Return ONLY valid JSON matching the schema exactly. Use null for unknown values.

Conversation:
{conversation}

Schema to fill:
{{
  "chief_complaint": "string or null",
  "duration": "string or null",
  "associated_symptoms": ["list of strings"],
  "medications": ["list of strings"],
  "allergies": ["list of strings"],
  "past_illnesses": ["list of strings"],
  "risk_flags": ["list of strings - emergency symptoms only"],
  "severity_score": "number 1-10 or null",
  "summary_text": "2-3 sentence summary"
}}"""

EMERGENCY_KEYWORDS = [
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "not breathing",
    "unconscious",
    "unresponsive",
    "severe bleeding",
    "stroke",
    "seizure",
    "anaphylaxis",
    "severe allergic reaction",
    "heart attack",
    "crushing pain",
    "jaw pain",
    "arm pain with chest",
    "sudden confusion",
    "face drooping",
    "arm weakness",
    "speech difficulty",
]

GREETING_MESSAGE = (
    "Hello! I'm the hospital intake assistant. I'll help gather some information before you see the doctor. "
    "Everything you share is confidential. Could you please start by telling me your name?"
)

CLOSING_MESSAGE = (
    "Thank you for answering all my questions. I've noted your information and the doctor will be with you shortly. "
    "Please let me know if you need anything while you wait."
)

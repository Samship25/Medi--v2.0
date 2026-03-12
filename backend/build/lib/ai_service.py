import json
import os
from typing import List

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText


MEDICINE_EXTRACTION_PROMPT = """
You extract medicine data from prescriptions, voice notes, or package text.
Return strict JSON with this shape only:
{"medicines":[{"medicine_name":"","dosage":"","frequency":"","notes":""}]}
If a field is missing, use an empty string. Do not include markdown.
"""


INTERACTION_PROMPT = """
You are a medication safety assistant. Return strict JSON only with this shape:
{"alerts":[{"medicine_combination":["A","B"],"severity_level":"mild|moderate|severe","explanation":"","safety_recommendation":""}]}
Only include genuine risks. Never diagnose diseases. Do not include markdown.
"""


CHAT_SYSTEM_PROMPT = """
You are Medi Track's medicine guidance assistant.
You can explain dosage, medicine purpose, general timing, and side effects, but you must not provide medical diagnosis or emergency clearance.
Always end risky answers by recommending a pharmacist or doctor review.
Keep responses concise, warm, and safety-first.
"""


def _json_or_default(raw_text: str, default_value: dict) -> dict:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                return default_value
    return default_value


def _build_chat(session_id: str, system_message: str) -> LlmChat:
    return LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=session_id,
        system_message=system_message,
    ).with_model("openai", "gpt-5.2")


async def extract_medicines_from_text(user_id: str, raw_text: str) -> List[dict]:
    default_value = {"medicines": []}
    try:
        chat = _build_chat(f"extract-{user_id}", MEDICINE_EXTRACTION_PROMPT)
        response = await chat.send_message(UserMessage(text=raw_text))
        payload = _json_or_default(response, default_value)
        return payload.get("medicines", [])
    except Exception:
        return []


async def analyze_interactions_dynamic(user_id: str, medicine_names: List[str]) -> List[dict]:
    default_value = {"alerts": []}
    if len(medicine_names) < 2:
        return []
    try:
        chat = _build_chat(f"interactions-{user_id}", INTERACTION_PROMPT)
        prompt = f"Analyze these active medicines for interaction risks: {', '.join(medicine_names)}"
        response = await chat.send_message(UserMessage(text=prompt))
        payload = _json_or_default(response, default_value)
        return payload.get("alerts", [])
    except Exception:
        return []


async def generate_chat_reply(user_id: str, history: List[dict], user_message: str) -> str:
    transcript = "\n".join(
        [f"{entry['role'].upper()}: {entry['message']}" for entry in history[-8:]]
    )
    prompt = f"Conversation so far:\n{transcript}\n\nLatest user message:\n{user_message}"
    try:
        chat = _build_chat(f"chat-{user_id}", CHAT_SYSTEM_PROMPT)
        return await chat.send_message(UserMessage(text=prompt))
    except Exception:
        return (
            "I’m unable to reach the AI guidance service right now. Please review the label, "
            "follow your prescription exactly, and confirm any dosing questions with your doctor or pharmacist."
        )


async def transcribe_voice_note(file_path: str) -> str:
    try:
        stt = OpenAISpeechToText(api_key=os.environ["EMERGENT_LLM_KEY"])
        with open(file_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en",
                prompt="This is a short medicine voice note that may contain medication names, dosage, and timing.",
                temperature=0.0,
            )
        return (response.text or "").strip()
    except Exception:
        return ""
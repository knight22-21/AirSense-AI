# -*- coding: utf-8 -*-
import os
import json
import logging
from typing import Dict

logger = logging.getLogger(__name__)


def _get_risk_level(aqi: float) -> str:
    if aqi <= 50:   return "Good"
    if aqi <= 100:  return "Moderate"
    if aqi <= 150:  return "Unhealthy for Sensitive Groups"
    if aqi <= 200:  return "Unhealthy"
    if aqi <= 300:  return "Very Unhealthy"
    return "Hazardous"


def _groq_client():
    from groq import Groq
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        return None
    return Groq(api_key=key)


async def generate_enforcement_summary(hotspot: Dict) -> str:
    """2-line enforcement action summary via Groq llama3-8b-8192."""
    client = _groq_client()
    if not client:
        return _mock_enforcement_summary(hotspot)

    evidence = ", ".join(hotspot.get("evidence_tags", []))
    prompt = (
        f"You are an air quality enforcement officer in Delhi.\n"
        f"Location: {hotspot.get('location', 'Delhi')}\n"
        f"Source: {hotspot.get('source_type', 'pollution')}\n"
        f"Evidence: {evidence}\n"
        f"Risk Score: {hotspot.get('score', 0)}/100\n\n"
        "Write EXACTLY 2 sentences: "
        "Sentence 1 = immediate enforcement action. "
        "Sentence 2 = expected pollution reduction impact."
    )
    try:
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"Groq enforcement summary failed: {e}")
        return _mock_enforcement_summary(hotspot)


async def generate_citizen_advisory(aqi: float, city: str = "Delhi") -> Dict:
    """Bilingual health advisory (English + Hindi) via Groq."""
    risk_level = _get_risk_level(aqi)
    client = _groq_client()
    if not client:
        return _mock_advisory(aqi, city, risk_level)

    prompt = (
        f"Generate a public health advisory for {city}, India.\n"
        f"Current AQI: {aqi:.0f} ({risk_level})\n\n"
        "Respond ONLY with valid JSON matching this schema:\n"
        '{"advisory_en": "<2-sentence English advisory>", '
        '"advisory_hi": "<2-sentence Hindi advisory in Devanagari>", '
        '"vulnerable_groups": ["<group1>", "<group2>", "<group3>"]}'
    )
    try:
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.3,
        )
        content = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content)
        return {
            "advisory_en": parsed.get("advisory_en", ""),
            "advisory_hi": parsed.get("advisory_hi", ""),
            "vulnerable_groups": parsed.get("vulnerable_groups", []),
            "risk_level": risk_level,
        }
    except Exception as e:
        logger.warning(f"Groq advisory failed: {e}")
        return _mock_advisory(aqi, city, risk_level)


# ------------------------------------------------------------------
# Static fallbacks
# ------------------------------------------------------------------

def _mock_enforcement_summary(hotspot: Dict) -> str:
    source = hotspot.get("source_type", "pollution source")
    loc = hotspot.get("location", "this zone")
    score = hotspot.get("score", 0)
    return (
        f"Deploy enforcement teams to {loc} immediately to inspect and seal {source} violations "
        f"(risk score {score}/100). "
        f"Halting illegal burning and industrial discharge is estimated to reduce local PM2.5 by 30–45% within 48 hours."
    )


_ADVISORIES = {
    "Good": {
        "en": "Air quality in {city} is Good today (AQI {aqi}). Enjoy outdoor activities freely.",
        "hi": "{city} में आज वायु गुणवत्ता अच्छी है (AQI {aqi})। बाहरी गतिविधियाँ सुरक्षित हैं।",
    },
    "Moderate": {
        "en": "Air quality in {city} is Moderate (AQI {aqi}). Unusually sensitive individuals should consider limiting prolonged outdoor exertion.",
        "hi": "{city} में वायु गुणवत्ता सामान्य है (AQI {aqi})। अति संवेदनशील व्यक्ति लंबे समय तक बाहर रहने से बचें।",
    },
    "Unhealthy for Sensitive Groups": {
        "en": "Air quality in {city} is Unhealthy for Sensitive Groups (AQI {aqi}). Children, elderly and those with respiratory conditions should reduce outdoor activities.",
        "hi": "{city} में वायु गुणवत्ता संवेदनशील समूहों के लिए हानिकारक है (AQI {aqi})। बच्चे, बुजुर्ग और दमा/श्वसन रोगी बाहर कम निकलें।",
    },
    "Unhealthy": {
        "en": "ALERT: Air quality in {city} is Unhealthy (AQI {aqi}). Everyone should reduce prolonged outdoor exertion; sensitive groups should avoid it entirely.",
        "hi": "चेतावनी: {city} में वायु गुणवत्ता अस्वस्थ है (AQI {aqi})। सभी लोग बाहरी गतिविधियाँ सीमित करें और N95 मास्क पहनें।",
    },
    "Very Unhealthy": {
        "en": "ALERT: Very Unhealthy air in {city} (AQI {aqi}). Avoid all outdoor activities; keep windows closed and use air purifiers indoors.",
        "hi": "चेतावनी: {city} में वायु गुणवत्ता बहुत खराब है (AQI {aqi})। सभी बाहरी गतिविधियाँ बंद करें, खिड़कियाँ बंद रखें।",
    },
    "Hazardous": {
        "en": "EMERGENCY: Hazardous air in {city} (AQI {aqi}). Stay indoors, use N99 respirators if venturing out, and seek medical help if you feel breathless.",
        "hi": "आपातकाल: {city} में वायु गुणवत्ता खतरनाक स्तर पर है (AQI {aqi})। घर के अंदर रहें, बाहर निकलें तो N99 मास्क लगाएं।",
    },
}


def _mock_advisory(aqi: float, city: str, risk_level: str) -> Dict:
    template = _ADVISORIES.get(risk_level, _ADVISORIES["Moderate"])
    ctx = {"city": city, "aqi": int(aqi)}
    return {
        "advisory_en": template["en"].format(**ctx),
        "advisory_hi": template["hi"].format(**ctx),
        "vulnerable_groups": ["Children under 12", "Elderly (60+)", "Asthma / COPD patients"],
        "risk_level": risk_level,
    }

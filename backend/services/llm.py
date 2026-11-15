# -*- coding: utf-8 -*-
import os
import asyncio
import hashlib
import json
import logging
from typing import Dict

from utils.aqi import risk_level
from utils.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")  # llama3-8b-8192 is retired

# Backwards-compatible alias (routers import this name directly)
_get_risk_level = risk_level


def _cache_key(prefix: str, payload: str) -> str:
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
    return f"llm:{prefix}:{digest}"


def _groq_client():
    from groq import Groq
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        return None
    return Groq(api_key=key)


async def generate_enforcement_summary(hotspot: Dict, city: str = "Delhi") -> str:
    """2-line enforcement action summary via Groq (cached per evidence fingerprint)."""
    evidence = ", ".join(hotspot.get("evidence_tags", []))
    fingerprint = "|".join([
        city, str(hotspot.get("location", "")), str(hotspot.get("source_type", "")),
        evidence, str(round(float(hotspot.get("score", 0) or 0))),
    ])
    key = _cache_key("enforcement", fingerprint)
    cached = cache_get(key, 3600)
    if cached:
        return cached

    client = _groq_client()
    if not client:
        return cache_set(key, _mock_enforcement_summary(hotspot))

    prompt = (
        f"You are an air quality enforcement officer in {city}, India.\n"
        f"Location: {hotspot.get('location', city)}\n"
        f"Source: {hotspot.get('source_type', 'pollution')}\n"
        f"Evidence: {evidence}\n"
        f"Risk Score: {hotspot.get('score', 0)}/100\n"
        f"Confidence: {hotspot.get('confidence', 0):.0%}\n\n"
        "Write EXACTLY 2 sentences: "
        "Sentence 1 = immediate enforcement action. "
        "Sentence 2 = expected pollution reduction impact."
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.3,
        )
        return cache_set(key, response.choices[0].message.content.strip())
    except Exception as e:
        logger.warning(f"Groq enforcement summary failed: {e}")
        return cache_set(key, _mock_enforcement_summary(hotspot))


async def generate_citizen_advisory(aqi: float, city: str = "Delhi", area: str = "") -> Dict:
    """Health advisory in English, Hindi, Tamil and Kannada via Groq."""
    level = risk_level(aqi)
    key = _cache_key("advisory", f"{city}|{int(aqi // 5)}")
    cached = cache_get(key, 1800)
    if cached:
        return cached

    client = _groq_client()
    if not client:
        return cache_set(key, _mock_advisory(aqi, city, level))

    prompt = (
        f"Generate a public health advisory for {city}, India.\n"
        f"Current AQI: {aqi:.0f} ({level})\n\n"
        "Respond ONLY with valid JSON matching this schema:\n"
        '{"advisory_en": "<2-sentence English advisory>", '
        '"advisory_hi": "<2-sentence Hindi advisory in Devanagari>", '
        '"advisory_ta": "<2-sentence Tamil advisory in Tamil script>", '
        '"advisory_kn": "<2-sentence Kannada advisory in Kannada script>", '
        '"vulnerable_groups": ["<group1>", "<group2>", "<group3>"]}'
    )
    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=700,
            temperature=0.3,
        )
        content = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content)
        return cache_set(key, {
            "advisory_en": parsed.get("advisory_en", ""),
            "advisory_hi": parsed.get("advisory_hi", ""),
            "advisory_ta": parsed.get("advisory_ta", ""),
            "advisory_kn": parsed.get("advisory_kn", ""),
            "vulnerable_groups": parsed.get("vulnerable_groups", []),
            "risk_level": level,
        })
    except Exception as e:
        logger.warning(f"Groq advisory failed: {e}")
        return cache_set(key, _mock_advisory(aqi, city, level))


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


_TA = {
    "Good": "இன்று {city} நகரில் காற்றின் தரம் நன்றாக உள்ளது (AQI {aqi}). வெளிப்புற செயல்பாடுகள் பாதுகாப்பானவை.",
    "Moderate": "{city} நகரில் காற்றின் தரம் மிதமானது (AQI {aqi}). மிகவும் உணர்திறன் உள்ளவர்கள் நீண்ட நேரம் வெளியில் இருப்பதைத் தவிர்க்கவும்.",
    "Unhealthy for Sensitive Groups": "{city} நகரில் காற்று உணர்திறன் உள்ளவர்களுக்கு ஆரோக்கியமற்றது (AQI {aqi}). குழந்தைகள், முதியவர்கள், சுவாச நோயாளிகள் வெளியே செல்வதைக் குறைக்கவும்.",
    "Unhealthy": "எச்சரிக்கை: {city} நகரில் காற்று ஆரோக்கியமற்றது (AQI {aqi}). வெளிப்புற செயல்பாடுகளைக் குறைத்து N95 முகக்கவசம் அணியவும்.",
    "Very Unhealthy": "எச்சரிக்கை: {city} நகரில் காற்று மிகவும் மோசம் (AQI {aqi}). வெளியே செல்வதைத் தவிர்த்து, ஜன்னல்களை மூடி வைக்கவும்.",
    "Hazardous": "அவசரநிலை: {city} நகரில் காற்று அபாயகரமானது (AQI {aqi}). வீட்டிற்குள்ளேயே இருங்கள்; மூச்சுத்திணறல் இருந்தால் மருத்துவ உதவி பெறுங்கள்.",
}

_KN = {
    "Good": "ಇಂದು {city} ನಲ್ಲಿ ಗಾಳಿಯ ಗುಣಮಟ್ಟ ಉತ್ತಮವಾಗಿದೆ (AQI {aqi}). ಹೊರಾಂಗಣ ಚಟುವಟಿಕೆಗಳು ಸುರಕ್ಷಿತ.",
    "Moderate": "{city} ನಲ್ಲಿ ಗಾಳಿಯ ಗುಣಮಟ್ಟ ಮಧ್ಯಮವಾಗಿದೆ (AQI {aqi}). ಅತಿ ಸೂಕ್ಷ್ಮ ವ್ಯಕ್ತಿಗಳು ಹೆಚ್ಚು ಹೊತ್ತು ಹೊರಗೆ ಇರುವುದನ್ನು ತಪ್ಪಿಸಿ.",
    "Unhealthy for Sensitive Groups": "{city} ನಲ್ಲಿ ಗಾಳಿ ಸೂಕ್ಷ್ಮ ಗುಂಪುಗಳಿಗೆ ಹಾನಿಕರ (AQI {aqi}). ಮಕ್ಕಳು, ವೃದ್ಧರು ಮತ್ತು ಉಸಿರಾಟದ ರೋಗಿಗಳು ಹೊರಗೆ ಹೋಗುವುದನ್ನು ಕಡಿಮೆ ಮಾಡಿ.",
    "Unhealthy": "ಎಚ್ಚರಿಕೆ: {city} ನಲ್ಲಿ ಗಾಳಿ ಅನಾರೋಗ್ಯಕರ (AQI {aqi}). ಹೊರಾಂಗಣ ಚಟುವಟಿಕೆ ಕಡಿಮೆ ಮಾಡಿ ಮತ್ತು N95 ಮಾಸ್ಕ್ ಧರಿಸಿ.",
    "Very Unhealthy": "ಎಚ್ಚರಿಕೆ: {city} ನಲ್ಲಿ ಗಾಳಿ ತುಂಬಾ ಕಳಪೆ (AQI {aqi}). ಹೊರಗೆ ಹೋಗುವುದನ್ನು ತಪ್ಪಿಸಿ ಮತ್ತು ಕಿಟಕಿಗಳನ್ನು ಮುಚ್ಚಿ.",
    "Hazardous": "ತುರ್ತು: {city} ನಲ್ಲಿ ಗಾಳಿ ಅಪಾಯಕಾರಿ (AQI {aqi}). ಮನೆಯೊಳಗೇ ಇರಿ; ಉಸಿರಾಟದ ತೊಂದರೆ ಇದ್ದರೆ ವೈದ್ಯಕೀಯ ಸಹಾಯ ಪಡೆಯಿರಿ.",
}


def _mock_advisory(aqi: float, city: str, risk_level: str) -> Dict:
    template = _ADVISORIES.get(risk_level, _ADVISORIES["Moderate"])
    ctx = {"city": city, "aqi": int(aqi)}
    return {
        "advisory_en": template["en"].format(**ctx),
        "advisory_hi": template["hi"].format(**ctx),
        "advisory_ta": _TA[risk_level].format(**ctx),
        "advisory_kn": _KN[risk_level].format(**ctx),
        "vulnerable_groups": ["Children under 12", "Elderly (60+)", "Asthma / COPD patients"],
        "risk_level": risk_level,
    }

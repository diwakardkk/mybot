"""
Report API — vitals CRUD, full report data, recommendation save, listen endpoint, export.
All endpoints are resilient: they work even when in-memory session is gone (server restart).
"""
from fastapi import APIRouter
from fastapi.responses import Response, JSONResponse
from datetime import datetime
import json as json_lib
import os

from app.models.vitals import VitalsInput, VitalsResponse
from app.models.recommendation import RecommendationInput, RecommendationResponse
from app.services import report_service, summary_service, tts_service
from app.db import session_repo, conversation_repo
from app.db.database import SessionLocal, DBVitals, DBRecommendation, DBSession, DBTurn
from app.core.logging import get_logger

router = APIRouter(prefix="/report", tags=["report"])
logger = get_logger(__name__)

# ── In-memory caches ───────────────────────────────────────────────────────────
_vitals_cache: dict = {}
_reco_cache: dict   = {}


# ── Internal helpers ───────────────────────────────────────────────────────────

def _get_patient_name(conversation_id: str) -> str:
    """Get patient name from memory or DB."""
    session = session_repo.get_session(conversation_id)
    if session:
        return session.patient_name or "Unknown Patient"
    try:
        db = SessionLocal()
        obj = db.query(DBSession).filter_by(conversation_id=conversation_id).first()
        db.close()
        if obj:
            return obj.patient_name or "Unknown Patient"
    except Exception:
        pass
    return "Unknown Patient"


def _get_turns_from_db(conversation_id: str) -> list:
    """Load turn objects from DB as simple dicts when memory repo is empty."""
    try:
        db = SessionLocal()
        rows = db.query(DBTurn).filter_by(conversation_id=conversation_id).order_by(DBTurn.turn_id).all()
        db.close()
        return rows
    except Exception as e:
        logger.warning(f"DB turns fetch error: {e}")
        return []


def _get_turns(conversation_id: str) -> list:
    """Get turns from memory first, then DB as fallback."""
    turns = conversation_repo.get_turns(conversation_id)
    if turns:
        return turns
    # Fallback: load from DB and wrap as simple objects
    rows = _get_turns_from_db(conversation_id)
    # Return rows as-is — they have .speaker and .text attributes
    return rows


def _build_transcript(turns) -> str:
    parts = []
    for t in turns:
        label = "Patient" if t.speaker == "patient" else "NurseBot"
        parts.append(f"[{label}]: {t.text}")
    return "\n".join(parts)


# ── Vitals ─────────────────────────────────────────────────────────────────────

@router.post("/vitals", response_model=VitalsResponse)
def save_vitals(data: VitalsInput):
    bmi_val = data.bmi
    _vitals_cache[data.conversation_id] = data
    try:
        db = SessionLocal()
        obj = db.query(DBVitals).filter_by(conversation_id=data.conversation_id).first()
        if obj:
            obj.bp_systolic  = data.bp_systolic
            obj.bp_diastolic = data.bp_diastolic
            obj.blood_sugar  = data.blood_sugar
            obj.weight_kg    = data.weight_kg
            obj.height_cm    = data.height_cm
            obj.bmi          = bmi_val
            obj.temperature  = data.temperature
            obj.pulse        = data.pulse
            obj.recorded_at  = datetime.utcnow()
        else:
            obj = DBVitals(
                conversation_id=data.conversation_id,
                bp_systolic=data.bp_systolic,   bp_diastolic=data.bp_diastolic,
                blood_sugar=data.blood_sugar,   weight_kg=data.weight_kg,
                height_cm=data.height_cm,       bmi=bmi_val,
                temperature=data.temperature,   pulse=data.pulse,
            )
            db.add(obj)
        db.commit(); db.close()
    except Exception as e:
        logger.warning(f"Vitals DB save error: {e}")
    return VitalsResponse(
        **data.model_dump(), bmi_value=bmi_val,
        bp_category_label=data.bp_category,
        sugar_category_label=data.sugar_category,
        bmi_category_label=data.bmi_category,
        recorded_at=datetime.utcnow(),
    )


@router.get("/vitals/{conversation_id}", response_model=VitalsResponse)
def get_vitals(conversation_id: str):
    if conversation_id in _vitals_cache:
        d = _vitals_cache[conversation_id]
        return VitalsResponse(
            **d.model_dump(), bmi_value=d.bmi,
            bp_category_label=d.bp_category,
            sugar_category_label=d.sugar_category,
            bmi_category_label=d.bmi_category,
        )
    try:
        db = SessionLocal()
        obj = db.query(DBVitals).filter_by(conversation_id=conversation_id).first()
        db.close()
        if obj:
            vi = VitalsInput(
                conversation_id=conversation_id,
                bp_systolic=obj.bp_systolic,   bp_diastolic=obj.bp_diastolic,
                blood_sugar=obj.blood_sugar,   weight_kg=obj.weight_kg,
                height_cm=obj.height_cm,       temperature=obj.temperature,
                pulse=obj.pulse,
            )
            return VitalsResponse(
                **vi.model_dump(), bmi_value=vi.bmi,
                bp_category_label=vi.bp_category,
                sugar_category_label=vi.sugar_category,
                bmi_category_label=vi.bmi_category,
                recorded_at=obj.recorded_at,
            )
    except Exception as e:
        logger.warning(f"Vitals DB get error: {e}")
    return VitalsResponse(conversation_id=conversation_id)


# ── Full Report ────────────────────────────────────────────────────────────────

@router.get("/full/{conversation_id}")
async def get_full_report(conversation_id: str):
    """Generate the complete GPT-refined report.
    Works even if server restarted (falls back to DB for turns/names).
    """
    patient_name = _get_patient_name(conversation_id)
    turns        = _get_turns(conversation_id)
    transcript   = _build_transcript(turns)

    # ── 1. LangChain/OpenAI structured medical analysis ──────────────────────
    analysis = {}
    try:
        analysis = report_service.generate_report_analysis_from_transcript(transcript)
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        analysis = report_service._empty_analysis()

    # ── 2. Structured extraction (name, age, gender, meds, allergies…) ───────
    extracted = {}
    try:
        from app.services.extraction_service import extract_intake_data_from_transcript
        extracted = await extract_intake_data_from_transcript(conversation_id, turns)
    except Exception as e:
        logger.error(f"Extraction error: {e}")

    # ── 3. GPT narrative refinement of the summary text ──────────────────────
    refined_summary = ""
    try:
        raw_summary = (
            f"Patient {extracted.get('patient_name') or patient_name}, "
            f"age {extracted.get('age','unknown')}, gender {extracted.get('gender','unknown')}. "
            f"Chief complaint: {analysis.get('chief_complaint_summary','Not established')}. "
            f"Symptom analysis: {analysis.get('symptom_analysis','')}. "
            f"Risk level: {analysis.get('risk_level','unknown')}. "
            f"Key findings: {'; '.join(analysis.get('key_findings',[]))}."
        )
        refined_summary = report_service.refine_narrative(raw_summary)
    except Exception as e:
        logger.error(f"GPT refinement error: {e}")
        refined_summary = analysis.get("chief_complaint_summary", "")

    # ── 4. Vitals ─────────────────────────────────────────────────────────────
    vitals = {}
    try:
        vr = get_vitals(conversation_id)
        vitals = vr.model_dump()
    except Exception:
        pass

    # ── 5. Recommendation from cache/DB ──────────────────────────────────────
    reco = _reco_cache.get(conversation_id, {})
    if not reco:
        try:
            db = SessionLocal()
            obj = db.query(DBRecommendation).filter_by(conversation_id=conversation_id).first()
            db.close()
            if obj:
                reco = {c.key: getattr(obj, c.key) for c in obj.__table__.columns}
        except Exception:
            pass

    # ── Assemble ──────────────────────────────────────────────────────────────
    return {
        "conversation_id": conversation_id,
        "patient_name":    extracted.get("patient_name") or patient_name,
        "age":             extracted.get("age", "—"),
        "gender":          extracted.get("gender", "—"),
        "generated_at":    datetime.utcnow().isoformat(),
        "summary": {
            "patient_name":        extracted.get("patient_name") or patient_name,
            "age":                 extracted.get("age", "—"),
            "gender":              extracted.get("gender", "—"),
            "chief_complaint":     extracted.get("chief_complaint"),
            "duration":            extracted.get("duration"),
            "medications":         extracted.get("medications", []),
            "allergies":           extracted.get("allergies", []),
            "summary_text":        refined_summary,
            "questions_completed": len(turns) // 2,
            "total_turns":         len(turns),
        },
        "analysis": {**analysis, "refined_summary": refined_summary},
        "vitals":          vitals,
        "recommendation":  reco,
    }


# ── Recommendations ────────────────────────────────────────────────────────────

@router.post("/recommendation", response_model=RecommendationResponse)
def save_recommendation(data: RecommendationInput):
    _reco_cache[data.conversation_id] = data.model_dump()
    try:
        db = SessionLocal()
        obj = db.query(DBRecommendation).filter_by(conversation_id=data.conversation_id).first()
        if obj:
            for k, v in data.model_dump().items():
                if k != "conversation_id":
                    setattr(obj, k, v)
            obj.saved_at = datetime.utcnow()
        else:
            obj = DBRecommendation(**data.model_dump(), saved_at=datetime.utcnow())
            db.add(obj)
        db.commit(); db.close()
    except Exception as e:
        logger.warning(f"Recommendation DB save error: {e}")
    return RecommendationResponse(**data.model_dump(), saved_at=datetime.utcnow())


# ── Listen (TTS) ───────────────────────────────────────────────────────────────

@router.get("/listen/{conversation_id}")
async def listen_conversation(conversation_id: str):
    """Return TTS audio of the full conversation transcript."""
    turns  = _get_turns(conversation_id)
    if not turns:
        return JSONResponse(status_code=404, content={"error": "No conversation turns found"})

    parts = []
    for t in turns:
        if t.speaker == "patient":
            parts.append(f"Patient said: {t.text}")
        else:
            parts.append(f"Nurse Bot said: {t.text}")
    script = ". ".join(parts)[:4000]  # TTS char limit

    try:
        audio_bytes = await tts_service.synthesize_speech(script)
        return Response(content=audio_bytes, media_type="audio/mpeg",
                        headers={"Content-Disposition": "inline; filename=conversation.mp3"})
    except Exception as e:
        logger.error(f"TTS error: {e}")
        return JSONResponse(status_code=500, content={"error": f"TTS failed: {str(e)}"})


# ── Export to local folder ─────────────────────────────────────────────────────

@router.post("/export/{conversation_id}")
async def export_report(conversation_id: str):
    """Save conversation JSON + full report JSON to data/exports/<patient_name>_<date>/"""
    patient_name = _get_patient_name(conversation_id).replace(" ", "_")
    date_str     = datetime.utcnow().strftime("%Y%m%d_%H%M")
    folder       = os.path.join("patient_data", f"{patient_name}_{date_str}")
    os.makedirs(folder, exist_ok=True)

    # Conversation JSON
    turns = _get_turns(conversation_id)
    turns_data = [
        {"speaker": t.speaker, "text": t.text,
         "timestamp": t.timestamp.isoformat() if hasattr(t.timestamp, 'isoformat') else str(t.timestamp)}
        for t in turns
    ]
    conv_path = os.path.join(folder, "conversation.json")
    with open(conv_path, "w", encoding="utf-8") as f:
        json_lib.dump({"conversation_id": conversation_id,
                       "patient_name": patient_name,
                       "turns": turns_data}, f, indent=2)

    # Full report JSON
    try:
        report_data = await get_full_report(conversation_id)
        report_path = os.path.join(folder, "report.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json_lib.dump(report_data, f, indent=2, default=str)
    except Exception as e:
        report_path = "error: " + str(e)

    abs_folder = os.path.abspath(folder)
    logger.info(f"Exported {conversation_id} to {abs_folder}")
    return {
        "status":  "exported",
        "folder":  abs_folder,
        "files": {
            "conversation": os.path.abspath(conv_path),
            "report":       report_path if isinstance(report_path, str) else os.path.abspath(report_path),
        }
    }

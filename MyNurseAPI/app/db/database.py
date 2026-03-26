"""
SQLAlchemy synchronous SQLite engine + session factory + init_db.
"""
from sqlalchemy import (
    create_engine, Column, String, Integer, Float, Boolean,
    Text, DateTime, JSON, MetaData
)
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


class DBSession(Base):
    __tablename__ = "sessions"
    conversation_id  = Column(String, primary_key=True)
    patient_name     = Column(String, nullable=True)
    language         = Column(String, default="en")
    voice_mode       = Column(Boolean, default=False)
    state            = Column(String, default="greeting")
    questions_asked  = Column(JSON, default=list)
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow)


class DBTurn(Base):
    __tablename__ = "turns"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id  = Column(String, index=True)
    turn_id          = Column(Integer)
    speaker          = Column(String)   # "patient" | "assistant"
    text             = Column(Text)
    state            = Column(String)
    timestamp        = Column(DateTime, default=datetime.utcnow)


class DBVitals(Base):
    __tablename__ = "vitals"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id  = Column(String, index=True, unique=True)
    bp_systolic      = Column(Float, nullable=True)
    bp_diastolic     = Column(Float, nullable=True)
    blood_sugar      = Column(Float, nullable=True)
    weight_kg        = Column(Float, nullable=True)
    height_cm        = Column(Float, nullable=True)
    bmi              = Column(Float, nullable=True)
    temperature      = Column(Float, nullable=True)
    pulse            = Column(Integer, nullable=True)
    recorded_at      = Column(DateTime, default=datetime.utcnow)


class DBRecommendation(Base):
    __tablename__ = "recommendations"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id  = Column(String, index=True, unique=True)
    doctor_notes     = Column(Text, nullable=True)
    follow_up_days   = Column(Integer, nullable=True)   # 7 / 15 / 30
    need_prescription= Column(Boolean, default=False)
    refer_specialist = Column(Boolean, default=False)
    lab_tests        = Column(Boolean, default=False)
    diet_advice      = Column(Boolean, default=False)
    exercise_advice  = Column(Boolean, default=False)
    follow_up_date   = Column(String, nullable=True)    # ISO date string
    saved_at         = Column(DateTime, default=datetime.utcnow)


class DBIntakeSummary(Base):
    __tablename__ = "intake_summaries"
    conversation_id  = Column(String, primary_key=True)
    patient_name     = Column(String, nullable=True)
    chief_complaint  = Column(Text, nullable=True)
    duration         = Column(String, nullable=True)
    symptoms         = Column(Text, nullable=True)
    medications      = Column(Text, nullable=True)
    allergies        = Column(Text, nullable=True)
    risk_flags       = Column(Text, nullable=True)
    summary_text     = Column(Text, nullable=True)
    key_findings     = Column(JSON, default=list)
    risk_level       = Column(String, default="low")
    is_emergency     = Column(Boolean, default=False)
    saved_at         = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine, checkfirst=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

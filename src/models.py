"""Pydantic data models for the Personal Health Plan (PHP) intermediate schema."""

from typing import Optional
from pydantic import BaseModel, Field


class Patient(BaseModel):
    family: str
    given: list[str]
    birth_date: Optional[str] = None  # YYYY-MM-DD


class WbsAssessment(BaseModel):
    session_number: Optional[int] = None
    session_date: Optional[str] = None  # YYYY-MM-DD; fill in from EHR if available
    satisfied: Optional[int] = None    # Q1: Fully satisfied (0-10)
    involved: Optional[int] = None     # Q2: Regularly involved (0-10)
    functioning: Optional[int] = None  # Q3: Functioning best (0-10)
    average: Optional[float] = None


class Map(BaseModel):
    """Mission, Aspiration, Purpose — the patient's Why Statement."""
    mission: Optional[str] = None
    aspiration: Optional[str] = None
    purpose: Optional[str] = None


class ActionStep(BaseModel):
    text: str
    importance: Optional[int] = None   # 1-10
    confidence: Optional[int] = None   # 1-10
    status: Optional[str] = None       # "met" | "not-met" | "in-progress"
    start_date: Optional[str] = None   # YYYY-MM-DD
    end_date: Optional[str] = None     # YYYY-MM-DD


class Goal(BaseModel):
    text: str
    importance: Optional[int] = None   # most recent readiness ruler value
    confidence: Optional[int] = None   # most recent readiness ruler value
    lifecycle_status: str = "active"   # "active" | "completed" | "cancelled"
    start_date: Optional[str] = None   # YYYY-MM-DD; when goal was set
    action_steps: list[ActionStep] = Field(default_factory=list)


class PhpData(BaseModel):
    patient: Optional[Patient] = None
    what_matters_most: Optional[str] = None   # MAP narrative (middle/final visits)
    map: Optional[Map] = None                  # structured M/A/P (initial visit)
    values: list[str] = Field(default_factory=list)
    vision: Optional[str] = None
    strengths: list[str] = Field(default_factory=list)
    wbs: Optional[WbsAssessment] = None        # most recent WBS scores
    goals: list[Goal] = Field(default_factory=list)
    is_final_session: bool = False
    discharge_plan: Optional[str] = None

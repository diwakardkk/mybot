from pydantic import BaseModel, Field, computed_field
from typing import Optional
from datetime import datetime


class VitalsInput(BaseModel):
    conversation_id: str
    bp_systolic: Optional[float] = None      # mmHg
    bp_diastolic: Optional[float] = None     # mmHg
    blood_sugar: Optional[float] = None      # mg/dL
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    temperature: Optional[float] = None      # °C
    pulse: Optional[int] = None              # bpm

    @property
    def bmi(self) -> Optional[float]:
        if self.weight_kg and self.height_cm and self.height_cm > 0:
            h_m = self.height_cm / 100
            return round(self.weight_kg / (h_m * h_m), 1)
        return None

    @property
    def bp_category(self) -> str:
        if not self.bp_systolic or not self.bp_diastolic:
            return "unknown"
        s, d = self.bp_systolic, self.bp_diastolic
        if s < 120 and d < 80:     return "Normal"
        if s < 130 and d < 80:     return "Elevated"
        if s < 140 or d < 90:      return "High Stage 1"
        if s >= 140 or d >= 90:    return "High Stage 2"
        return "Unknown"

    @property
    def sugar_category(self) -> str:
        if not self.blood_sugar:
            return "unknown"
        v = self.blood_sugar
        if v < 70:    return "Low"
        if v <= 99:   return "Normal"
        if v <= 125:  return "Pre-diabetic"
        return "Diabetic Range"

    @property
    def bmi_category(self) -> str:
        b = self.bmi
        if b is None:   return "unknown"
        if b < 18.5:    return "Underweight"
        if b < 25:      return "Normal"
        if b < 30:      return "Overweight"
        return "Obese"


class VitalsResponse(VitalsInput):
    bmi_value: Optional[float] = None
    bp_category_label: str = ""
    sugar_category_label: str = ""
    bmi_category_label: str = ""
    recorded_at: Optional[datetime] = None

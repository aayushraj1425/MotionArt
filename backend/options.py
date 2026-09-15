from pydantic import BaseModel, ConfigDict, Field


class AnimeOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    fps: int = Field(12, ge=6, le=24)
    levels: int = Field(6, ge=3, le=12)
    edgeThreshold: float = Field(18, ge=5, le=80)
    saturation: float = Field(1.5, ge=0, le=2)
    maxWidth: int = Field(720, ge=320, le=1080)
    quantizer: int = Field(20, ge=10, le=40)
    smoothing: int = Field(1, ge=0, le=3)
    outlineStrength: float = Field(0.75, ge=0, le=1)
    contrast: float = Field(1.1, ge=0.5, le=1.5)
    detail: float = Field(1, ge=0, le=1.5)
    celStrength: float = Field(0.8, ge=0, le=1)
    paletteStrength: float = Field(0.65, ge=0, le=1)
    clipSeconds: float = Field(5, ge=0.1, le=10)
    temporalStrength: float = Field(0.6, ge=0, le=1)

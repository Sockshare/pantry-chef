"""Configuration and persistent settings for Pantry Chef."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def data_dir() -> Path:
    custom = os.environ.get("PANTRY_DATA_DIR")
    p = Path(custom) if custom else (ROOT_DIR / "data")
    p.mkdir(parents=True, exist_ok=True)
    return p


def config_path() -> Path:
    return data_dir() / "settings.json"


@dataclass
class Settings:
    provider: str = "offline"  # offline | ollama | openai | gemini
    ollama_host: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"
    ollama_vision_model: str = "moondream"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    default_servings: int = 2
    voice_enabled: bool = True
    chime_enabled: bool = True

    def effective_model(self) -> str:
        if self.provider == "ollama":
            return f"{self.ollama_model} / {self.ollama_vision_model}"
        if self.provider == "openai":
            return self.openai_model
        if self.provider == "gemini":
            return self.gemini_model
        return "Culinary Alchemist Deterministic Engine v1"


def load_settings() -> Settings:
    p = config_path()
    s = Settings()
    if os.environ.get("PANTRY_PROVIDER"):
        s.provider = os.environ["PANTRY_PROVIDER"]
    if p.exists():
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            for k, v in raw.items():
                if hasattr(s, k):
                    setattr(s, k, v)
        except Exception:
            pass
    return s


def save_settings(s: Settings) -> Settings:
    p = config_path()
    p.write_text(json.dumps(asdict(s), indent=2), encoding="utf-8")
    return s

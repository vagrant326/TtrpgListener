from dataclasses import dataclass, field


@dataclass
class Mood:
    key: str
    name: str
    # Shown to the classifier, so it should describe what the table sounds like in this mood.
    description: str = ""
    # Scene settings per integration id, shaped by that integration's scene_fields.
    scene: dict[str, dict] = field(default_factory=dict)

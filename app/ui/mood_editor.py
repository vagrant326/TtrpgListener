import re
import tkinter as tk
from tkinter import ttk
from typing import Any, Callable

from app.integrations.integration import Integration
from app.integrations.setting_field import SettingField
from app.models.mood import Mood
from app.ui.field_widgets import build_form, dict_binding

_MOOD_FIELDS = [
    SettingField("name", "Nazwa"),
    SettingField("key", "Klucz (dla modelu)"),
    SettingField("description", "Opis dla modelu"),
]


class MoodEditor(ttk.Frame):
    def __init__(self, parent, moods: list[Mood], integrations: list[Integration], on_change: Callable[[], None]):
        super().__init__(parent, padding=8)
        self._moods = moods
        self._integrations = integrations
        self._on_change = on_change
        self._selected: Mood | None = None

        left = ttk.Frame(self)
        left.pack(side="left", fill="y")
        self._list = tk.Listbox(left, width=22, exportselection=False)
        self._list.pack(fill="y", expand=True)
        self._list.bind("<<ListboxSelect>>", lambda _: self._list.curselection() and self._select(self._list.curselection()[0]))
        ttk.Button(left, text="Dodaj", command=self._add).pack(fill="x", pady=(6, 0))
        ttk.Button(left, text="Usuń", command=self._remove).pack(fill="x")

        self._form = ttk.Frame(self, padding=(12, 0))
        self._form.pack(side="left", fill="both", expand=True)
        self._refresh_list(0)

    def refresh(self) -> None:
        if self._selected is not None:
            self._select(self._moods.index(self._selected))

    def _refresh_list(self, select: int) -> None:
        self._list.delete(0, "end")
        for mood in self._moods:
            self._list.insert("end", mood.name)
        if self._moods:
            self._list.selection_set(select)
            self._select(select)

    def _select(self, index: int) -> None:
        mood = self._selected = self._moods[index]
        for child in self._form.winfo_children():
            child.destroy()

        basics = ttk.Frame(self._form)
        basics.pack(fill="x")
        build_form(basics, _MOOD_FIELDS, lambda f: getattr(mood, f.key), lambda f, v: self._set_basic(mood, f.key, v))

        for integration in self._integrations:
            if not integration.scene_fields:
                continue
            title = integration.name if integration.enabled else f"{integration.name} (wyłączona)"
            box = ttk.LabelFrame(self._form, text=title, padding=6)
            box.pack(fill="x", pady=(8, 0))
            build_form(box, integration.scene_fields, *dict_binding(mood.scene.setdefault(integration.id, {}), self._on_change))

    def _set_basic(self, mood: Mood, attr: str, value: Any) -> None:
        if attr == "key":
            value = re.sub(r"\W", "", value.lower())
        setattr(mood, attr, value)
        if attr == "name":
            index = self._moods.index(mood)
            self._list.delete(index)
            self._list.insert(index, value)
            self._list.selection_set(index)
        self._on_change()

    def _add(self) -> None:
        self._moods.append(Mood(f"nastroj{len(self._moods) + 1}", "Nowy nastrój"))
        self._refresh_list(len(self._moods) - 1)
        self._on_change()

    def _remove(self) -> None:
        if self._selected is None or len(self._moods) <= 1:
            return
        self._moods.remove(self._selected)
        self._selected = None
        self._refresh_list(0)
        self._on_change()

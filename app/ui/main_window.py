import queue
import tkinter as tk
from tkinter import ttk

from app.audio_listener import list_microphones
from app.config_store import save_config
from app.debug_log import DebugLog
from app.integrations.integration_context import IntegrationContext
from app.integrations.setting_field import SettingField
from app.models.app_config import AppConfig
from app.models.mood import Mood
from app.session import Session
from app.ui.debug_tab import DebugTab
from app.ui.field_widgets import build_form
from app.ui.integrations_tab import IntegrationsTab
from app.ui.mood_editor import MoodEditor

_GENERAL_FIELDS = [
    SettingField("microphone", "Mikrofon", "choice", "(domyślny)", lambda: ["(domyślny)"] + list_microphones()),
    SettingField("whisper_hint", "Nazwy własne (podpowiedź dla Whispera)"),
    SettingField("silence_rms", "Próg ciszy (RMS, patrz zakładka Debug)", "float"),
    SettingField("chunk_seconds", "Długość fragmentu audio [s]", "int"),
    SettingField("classify_every_seconds", "Klasyfikacja co [s]", "int"),
    SettingField("min_chars_to_classify", "Min. znaków do klasyfikacji", "int"),
    SettingField("max_chars_per_request", "Maks. znaków na zapytanie", "int"),
    SettingField("claude_model", "Model Claude"),
    SettingField("whisper_url", "Adres serwera Whisper"),
]
# Events too chatty for the session log; they're all on the Debug tab.
_QUIET_KINDS = {"audio", "skip"}


class MainWindow:
    def __init__(self, root: tk.Tk, config: AppConfig):
        self._root = root
        self._config = config
        self._ui_queue: queue.Queue = queue.Queue()
        self._debug = DebugLog()
        self._debug.subscribe(lambda event: self._post(self._on_event, event))
        self._session = Session(config, self._debug, self._make_context, lambda mood: self._post(self._show_mood, mood))

        root.title("TTRPG Listener")
        scale = root.winfo_fpixels("1i") / 96
        root.geometry(f"{int(1000 * scale)}x{int(680 * scale)}")
        root.protocol("WM_DELETE_WINDOW", self._close)

        notebook = ttk.Notebook(root)
        notebook.pack(fill="both", expand=True)
        notebook.add(self._build_session_tab(notebook), text="Sesja")
        self._mood_editor = MoodEditor(notebook, config.moods, self._session.integrations, self._moods_changed)
        notebook.add(self._mood_editor, text="Nastroje i sceny")
        notebook.add(IntegrationsTab(notebook, self._session.integrations, self._save), text="Integracje")
        notebook.add(self._build_settings_tab(notebook), text="Ustawienia")
        self._debug_tab = DebugTab(notebook, self._session)
        notebook.add(self._debug_tab, text="Debug")
        # Enabled/disabled integrations change what the mood editor shows.
        notebook.bind("<<NotebookTabChanged>>", lambda _: self._mood_editor.refresh())

        self._debug.emit("info", f"Log sesji: {self._debug.path}")
        self._drain_ui_queue()

    def _post(self, fn, *args) -> None:
        self._ui_queue.put((fn, args))

    def _drain_ui_queue(self) -> None:
        while not self._ui_queue.empty():
            fn, args = self._ui_queue.get()
            fn(*args)
        # Short interval because colour fades are painted through this queue.
        self._root.after(15, self._drain_ui_queue)

    def _make_context(self, integration_id: str, name: str) -> IntegrationContext:
        return IntegrationContext(
            self._root, self._post,
            lambda message: self._debug.emit("integration", f"{name}: {message}", integration=integration_id),
            self._save)

    def _save(self) -> None:
        save_config(self._config)

    def _on_event(self, event: dict) -> None:
        self._debug_tab.add_event(event)
        self._tokens_label.configure(text=f"Tokeny: {self._session.tokens_used}")
        if event["kind"] not in _QUIET_KINDS:
            self._log_box.configure(state="normal")
            self._log_box.insert("end", f"[{event['time'][:8]}] {event['summary']}\n")
            self._log_box.see("end")
            self._log_box.configure(state="disabled")

    def _build_session_tab(self, parent) -> ttk.Frame:
        tab = ttk.Frame(parent, padding=8)
        top = ttk.Frame(tab)
        top.pack(fill="x")
        self._listen_button = ttk.Button(top, text="▶ Start nasłuchu", command=self._toggle_listening)
        self._listen_button.pack(side="left")
        self._auto_var = tk.BooleanVar(value=self._config.auto_mode)
        ttk.Checkbutton(top, text="Tryb automatyczny", variable=self._auto_var,
                        command=self._auto_changed).pack(side="left", padx=12)
        self._tokens_label = ttk.Label(top, text="Tokeny: 0")
        self._tokens_label.pack(side="right")

        self._mood_label = tk.Label(tab, text="—", font=("Segoe UI", 22, "bold"), pady=10)
        self._mood_label.pack(fill="x", pady=8)

        self._scene_buttons = ttk.Frame(tab)
        self._scene_buttons.pack(fill="x")
        self._rebuild_scene_buttons()

        self._log_box = tk.Text(tab, height=14, wrap="word", state="disabled")
        self._log_box.pack(fill="both", expand=True, pady=(8, 0))
        return tab

    def _build_settings_tab(self, parent) -> ttk.Frame:
        tab = ttk.Frame(parent, padding=8)

        def set_(field: SettingField, value) -> None:
            setattr(self._config, field.key, value)
            self._save()

        build_form(tab, _GENERAL_FIELDS, lambda f: getattr(self._config, f.key), set_)
        return tab

    def _rebuild_scene_buttons(self) -> None:
        for child in self._scene_buttons.winfo_children():
            child.destroy()
        for mood in self._config.moods:
            ttk.Button(self._scene_buttons, text=mood.name,
                       command=lambda m=mood: self._session.apply_mood(m, "ręcznie")).pack(side="left", padx=2)

    def _show_mood(self, mood: Mood) -> None:
        color = mood.scene.get("projector", {}).get("color", "#808080")
        r, g, b = (int(color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
        self._mood_label.configure(text=mood.name, background=color,
                                   foreground="white" if 0.299 * r + 0.587 * g + 0.114 * b < 128 else "black")

    def _auto_changed(self) -> None:
        self._config.auto_mode = self._auto_var.get()
        self._save()

    def _moods_changed(self) -> None:
        self._save()
        self._rebuild_scene_buttons()

    def _toggle_listening(self) -> None:
        if self._session.is_listening:
            self._session.stop_listening()
            self._listen_button.configure(text="▶ Start nasłuchu")
        else:
            self._session.start_listening()
            self._listen_button.configure(text="■ Stop nasłuchu")

    def _close(self) -> None:
        self._session.shutdown()
        self._save()
        self._root.destroy()

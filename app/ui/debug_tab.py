import json
import math
import os
import tkinter as tk
from tkinter import filedialog, ttk

from app.debug_log import LOG_DIR
from app.scenario_player import ScenarioPlayer, load_scenarios
from app.session import Session

_MAX_ROWS = 3000


class DebugTab(ttk.Frame):
    def __init__(self, parent, session: Session):
        super().__init__(parent, padding=8)
        self._session = session
        self._player = ScenarioPlayer(session)
        self._scenarios = load_scenarios()
        self._events: dict[str, dict] = {}
        self._stats = {"whisper_n": 0, "whisper_s": 0.0, "audio_s": 0.0, "silent": 0,
                       "claude_n": 0, "claude_s": 0.0, "tokens": 0, "hits": 0, "checked": 0}

        meter_row = ttk.Frame(self)
        meter_row.pack(fill="x")
        ttk.Label(meter_row, text="Mikrofon:").pack(side="left")
        self._meter = ttk.Progressbar(meter_row, maximum=100, length=220)
        self._meter.pack(side="left", padx=6)
        self._meter_label = ttk.Label(meter_row, width=34)
        self._meter_label.pack(side="left")
        ttk.Button(meter_row, text="Folder logów", command=lambda: os.startfile(LOG_DIR)).pack(side="right")

        inject_row = ttk.Frame(self)
        inject_row.pack(fill="x", pady=(6, 0))
        self._inject_var = tk.StringVar()
        entry = ttk.Entry(inject_row, textvariable=self._inject_var)
        entry.pack(side="left", fill="x", expand=True)
        entry.bind("<Return>", lambda _: self._inject())
        ttk.Button(inject_row, text="Wstrzyknij tekst", command=self._inject).pack(side="left", padx=2)
        ttk.Button(inject_row, text="Klasyfikuj teraz", command=session.classify_now).pack(side="left", padx=2)
        ttk.Button(inject_row, text="Transkrybuj WAV…", command=self._pick_wav).pack(side="left", padx=2)

        scenario_row = ttk.Frame(self)
        scenario_row.pack(fill="x", pady=(6, 0))
        ttk.Label(scenario_row, text="Scenariusz:").pack(side="left")
        self._scenario_box = ttk.Combobox(scenario_row, state="readonly", width=55,
                                          values=[s["name"] for s in self._scenarios])
        self._scenario_box.current(0)
        self._scenario_box.pack(side="left", padx=6)
        ttk.Label(scenario_row, text="odstęp linii [s]").pack(side="left")
        self._delay_var = tk.StringVar(value="0.5")
        ttk.Entry(scenario_row, textvariable=self._delay_var, width=5).pack(side="left", padx=4)
        ttk.Button(scenario_row, text="▶ Odtwórz", command=self._play).pack(side="left", padx=2)
        ttk.Button(scenario_row, text="■ Stop", command=self._player.stop).pack(side="left")

        self._stats_label = ttk.Label(self, foreground="gray")
        self._stats_label.pack(fill="x", pady=(6, 0))

        panes = ttk.PanedWindow(self, orient="vertical")
        panes.pack(fill="both", expand=True, pady=(6, 0))
        tree_frame = ttk.Frame(panes)
        self._tree = ttk.Treeview(tree_frame, columns=("time", "kind", "summary"), show="headings", height=12)
        for column, title, width in (("time", "Czas", 90), ("kind", "Typ", 80), ("summary", "Opis", 700)):
            self._tree.heading(column, text=title)
            self._tree.column(column, width=width, stretch=column == "summary")
        scroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self._tree.yview)
        self._tree.configure(yscrollcommand=scroll.set)
        self._tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self._tree.bind("<<TreeviewSelect>>", lambda _: self._show_details())
        self._tree.tag_configure("error", foreground="#c00000")
        self._tree.tag_configure("scene", foreground="#0050c0")
        self._tree.tag_configure("scenario", foreground="#806000")
        self._details = tk.Text(panes, height=8, wrap="word", font=("Consolas", 9))
        panes.add(tree_frame, weight=3)
        panes.add(self._details, weight=1)

        self._update_stats()
        self.after(100, self._poll_level)

    def add_event(self, event: dict) -> None:
        iid = str(len(self._events))
        self._events[iid] = event
        follow = not self._tree.selection()
        self._tree.insert("", "end", iid=iid, values=(event["time"], event["kind"], event["summary"]),
                          tags=(event["kind"],))
        if len(self._events) > _MAX_ROWS:
            oldest = self._tree.get_children()[0]
            self._tree.delete(oldest)
            del self._events[oldest]
        if follow:
            self._tree.see(iid)
        self._count(event)

    def _count(self, event: dict) -> None:
        s = self._stats
        if event["kind"] == "audio":
            if event.get("skipped"):
                s["silent"] += 1
            else:
                s["whisper_n"] += 1
                s["whisper_s"] += event["whisper_seconds"]
                s["audio_s"] += event["audio_seconds"]
        elif event["kind"] == "classify":
            s["claude_n"] += 1
            s["claude_s"] += event["seconds"]
            s["tokens"] += event["input_tokens"] + event["output_tokens"]
            if event.get("match") is not None:
                s["checked"] += 1
                s["hits"] += event["match"]
        self._update_stats()

    def _update_stats(self) -> None:
        s = self._stats
        whisper = (f"Whisper: {s['whisper_n']} fragm., śr. {s['whisper_s'] / s['whisper_n']:.1f}s "
                   f"(x{s['audio_s'] / s['whisper_s']:.1f} czasu rzeczywistego), cisza: {s['silent']}"
                   if s["whisper_n"] and s["whisper_s"] else f"Whisper: 0 fragm., cisza: {s['silent']}")
        claude = (f"Claude: {s['claude_n']} zapytań, śr. {s['claude_s'] / s['claude_n']:.1f}s, "
                  f"{s['tokens']} tok (śr. {s['tokens'] // s['claude_n']}/zapytanie)"
                  if s["claude_n"] else "Claude: 0 zapytań")
        accuracy = f"Trafność: {s['hits']}/{s['checked']}" if s["checked"] else "Trafność: —"
        self._stats_label.configure(text=f"{whisper}   |   {claude}   |   {accuracy}")

    def _show_details(self) -> None:
        selection = self._tree.selection()
        if not selection:
            return
        self._details.delete("1.0", "end")
        self._details.insert("1.0", json.dumps(self._events[selection[0]], ensure_ascii=False, indent=2))

    def _poll_level(self) -> None:
        level = self._session.mic_level
        threshold = self._session.config.silence_rms
        # sqrt scale so quiet speech is still visible on the bar
        self._meter["value"] = min(100.0, math.sqrt(level / 0.1) * 100)
        if self._session.is_listening:
            state = "mowa" if level >= threshold else "cisza"
            self._meter_label.configure(text=f"RMS {level:.4f} (próg {threshold}) — {state}")
        else:
            self._meter_label.configure(text="nasłuch wyłączony")
        self.after(100, self._poll_level)

    def _inject(self) -> None:
        text = self._inject_var.get().strip()
        if text:
            self._session.inject_text(text)
            self._inject_var.set("")

    def _pick_wav(self) -> None:
        path = filedialog.askopenfilename(filetypes=[("WAV", "*.wav")], parent=self)
        if path:
            self._session.transcribe_file(path)

    def _play(self) -> None:
        try:
            delay = float(self._delay_var.get())
        except ValueError:
            delay = 0.5
        self._player.play(self._scenarios[self._scenario_box.current()], delay)

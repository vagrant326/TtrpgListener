import threading
import tkinter as tk
from tkinter import ttk
from typing import Callable

from app.integrations.integration import Integration
from app.integrations.integration_action import IntegrationAction
from app.ui.field_widgets import build_form, dict_binding


class IntegrationsTab(ttk.Frame):
    def __init__(self, parent, integrations: list[Integration], on_change: Callable[[], None]):
        super().__init__(parent, padding=8)
        self._status_labels: list[tuple[Integration, ttk.Label]] = []

        for integration in integrations:
            box = ttk.LabelFrame(self, text=integration.name, padding=8)
            box.pack(fill="x", pady=4)

            header = ttk.Frame(box)
            header.pack(fill="x")
            enabled = tk.BooleanVar(value=integration.enabled)
            ttk.Checkbutton(header, text="Włączona", variable=enabled,
                            command=lambda i=integration, v=enabled: self._set_enabled(i, v.get(), on_change)).pack(side="left")
            status = ttk.Label(header, foreground="gray")
            status.pack(side="left", padx=12)
            self._status_labels.append((integration, status))
            for action in integration.actions():
                ttk.Button(header, text=action.label,
                           command=lambda i=integration, a=action: self._run_action(i, a)).pack(side="right", padx=2)

            if integration.settings_fields:
                form = ttk.Frame(box)
                form.pack(fill="x", pady=(6, 0))
                build_form(form, integration.settings_fields, *dict_binding(integration.settings, on_change))

        self._refresh_statuses()

    @staticmethod
    def _set_enabled(integration: Integration, value: bool, on_change: Callable[[], None]) -> None:
        integration.settings["enabled"] = value
        on_change()

    @staticmethod
    def _run_action(integration: Integration, action: IntegrationAction) -> None:
        def run():
            try:
                action.run()
            except Exception as e:
                integration.context.log(f"{action.label}: błąd: {e}")
        threading.Thread(target=run, daemon=True).start()

    def _refresh_statuses(self) -> None:
        for integration, label in self._status_labels:
            label.configure(text=integration.status())
        self.after(1000, self._refresh_statuses)

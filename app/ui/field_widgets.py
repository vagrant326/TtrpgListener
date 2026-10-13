import tkinter as tk
from tkinter import colorchooser, ttk
from typing import Any, Callable

from app.integrations.setting_field import SettingField

Getter = Callable[[SettingField], Any]
Setter = Callable[[SettingField, Any], None]


def dict_binding(store: dict, on_change: Callable[[], None]) -> tuple[Getter, Setter]:
    def get(field: SettingField) -> Any:
        return store.get(field.key, field.default)

    def set_(field: SettingField, value: Any) -> None:
        store[field.key] = value
        on_change()

    return get, set_


def build_field(parent, field: SettingField, get: Getter, set_: Setter) -> tk.Widget:
    if field.kind == "color":
        swatch = tk.Label(parent, width=10, relief="groove", cursor="hand2", background=get(field))

        def pick(_):
            _, hex_color = colorchooser.askcolor(get(field), parent=parent)
            if hex_color:
                set_(field, hex_color)
                swatch.configure(background=hex_color)

        swatch.bind("<Button-1>", pick)
        return swatch

    var = tk.StringVar(value=str(get(field)))
    if field.kind == "choice":
        widget = ttk.Combobox(parent, textvariable=var, state="readonly", values=field.choices())
        widget.configure(postcommand=lambda: widget.configure(values=field.choices()))
    else:
        widget = ttk.Entry(parent, textvariable=var)
    cast = {"int": int, "float": float}.get(field.kind, str)

    def changed(*_):
        try:
            value = cast(var.get())
        except ValueError:
            return
        set_(field, value)

    var.trace_add("write", changed)
    return widget


def build_form(parent, fields: list[SettingField], get: Getter, set_: Setter) -> None:
    parent.columnconfigure(1, weight=1)
    for row, field in enumerate(fields):
        ttk.Label(parent, text=field.label).grid(row=row, column=0, sticky="w", pady=2, padx=(0, 8))
        build_field(parent, field, get, set_).grid(row=row, column=1, sticky="w" if field.kind == "color" else "ew", pady=2)

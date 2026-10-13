import ctypes
import tkinter as tk

from app.config_store import load_config
from app.ui.main_window import MainWindow

# Without per-monitor DPI awareness the projector window lands at scaled coordinates on mixed-DPI setups.
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except (AttributeError, OSError):
    pass

root = tk.Tk()
MainWindow(root, load_config())
root.mainloop()

FROM python:3.11-slim

RUN pip install --no-cache-dir faster-whisper==1.1.1 numpy requests

WORKDIR /srv
COPY server.py .

ENV HF_HOME=/models
EXPOSE 8765
CMD ["python", "-u", "server.py"]

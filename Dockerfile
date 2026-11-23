FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY primebot ./primebot
RUN pip install --no-cache-dir .
ENV PRIMEBOT_BACKEND=echo
EXPOSE 8080
CMD ["uvicorn", "primebot.app:app", "--host", "0.0.0.0", "--port", "8080"]

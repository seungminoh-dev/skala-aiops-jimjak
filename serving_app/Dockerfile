# 빌드에는 패키지와 코드만 포함한다. 학습·등록은 compose의 init 명령으로 수행한다.
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MODEL_SOURCE=mlflow \
    LOADING_MODE=eager \
    MLFLOW_TRACKING_URI=sqlite:////state/mlflow.db \
    ARTIFACT_ROOT=/state/mlartifacts \
    UPLOAD_DIR=/state/uploads \
    LOG_DIR=/state/logs \
    LOCAL_MODEL_DIR=/state/models/v1 \
    DRIFT_THRESHOLD_PATH=/state/drift_threshold.json

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY serving_app/ serving_app/
COPY data/ data/
COPY scripts/ scripts/
RUN mkdir -p /state/mlartifacts /state/uploads /state/logs /state/models

EXPOSE 8077
CMD ["python", "-m", "uvicorn", "serving_app.main:app", "--host", "0.0.0.0", "--port", "8077"]

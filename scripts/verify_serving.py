"""시연 증거용 API 검증. 예: python scripts/verify_serving.py --output /tmp/eager.json"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data.features import load_rows, sequence_samples
from serving_app.config import settings


def verify(base_url, csv_path, expected_version=None):
    session = requests.Session()
    session.trust_env = False
    base_url = base_url.rstrip('/')
    before = session.get(f'{base_url}/health', timeout=10)
    if before.status_code not in (200, 503):
        before.raise_for_status()
    initial = before.json()
    before_body = initial.get('detail', initial)
    history, target = sequence_samples(load_rows(csv_path))[0]
    following = history[1:] + [target]
    payload = {'sequence': [{'wait_min': row['wait_min'], 'next_seats': nxt['seats']}
                            for row, nxt in zip(history, following)]}
    predictions = []
    for _ in range(2):
        start = time.perf_counter()
        response = session.post(f'{base_url}/predict', json=payload, timeout=60)
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.raise_for_status()
        body = response.json()
        if expected_version and body['model_version'] != expected_version:
            raise AssertionError(f"버전 불일치: {body['model_version']} != {expected_version}")
        predictions.append({'client_ms': round(elapsed_ms, 1),
                            'server_ms': float(response.headers['X-Response-Time-Ms']), **body})
    after = session.get(f'{base_url}/health', timeout=10)
    after.raise_for_status()
    with open(csv_path, 'rb') as stream:
        upload = session.post(f'{base_url}/data/upload',
                              files={'file': (Path(csv_path).name, stream, 'text/csv')}, timeout=10)
    upload.raise_for_status()
    status = session.get(f'{base_url}/data/status', timeout=10)
    status.raise_for_status()
    monitoring = session.get(f'{base_url}/monitoring/status', timeout=10)
    monitoring.raise_for_status()
    logs = session.get(f'{base_url}/logs', timeout=10)
    logs.raise_for_status()
    # 19편 입력은 API 스키마 검증에서 거부해야 한다.
    invalid = session.post(f'{base_url}/predict', json={'sequence': payload['sequence'][:-1]}, timeout=10)
    if invalid.status_code != 422:
        raise AssertionError(f'19편 입력에 422 대신 {invalid.status_code} 반환')
    return {'measured_at_utc': datetime.now(timezone.utc).isoformat(),
            'loading_mode': before_body['loading_mode'], 'health_before': before_body,
            'health_after': after.json(), 'predict_first': predictions[0],
            'predict_second': predictions[1], 'upload': upload.json(),
            'data_status': status.json(), 'monitoring': monitoring.json(),
            'logs': logs.json(), 'invalid_sequence_status': invalid.status_code}


def main():
    parser = argparse.ArgumentParser(description='API·버전·Lazy/Eager 예측 시간 검증 (새 서버 프로세스에서 실행)')
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--csv', default=settings.training_data_path)
    parser.add_argument('--expected-version')
    parser.add_argument('--output', help='검증 결과 JSON 저장 위치')
    args = parser.parse_args()
    result = verify(args.url, args.csv, args.expected_version)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + '\n', encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()

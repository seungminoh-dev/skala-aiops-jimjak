"""새 서버 프로세스에서 Eager/Lazy 시작·첫 예측·두 번째 예측 시간을 측정한다."""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.verify_serving import verify
from serving_app.config import settings


def measure(mode, port, csv_path, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    url = f'http://127.0.0.1:{port}'
    environment = {**os.environ, 'LOADING_MODE': mode}
    session = requests.Session()
    session.trust_env = False
    log_path = output_dir / f'{mode}_server.log'
    with log_path.open('w', encoding='utf-8') as log:
        started = time.perf_counter()
        process = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'serving_app.main:app',
             '--host', '127.0.0.1', '--port', str(port)],
            cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = started + 120
            while time.perf_counter() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f'{mode} 서버 시작 실패: {log_path.read_text()[-4000:]}')
                try:
                    response = session.get(f'{url}/health', timeout=1)
                    if response.status_code in (200, 503):
                        break
                except requests.RequestException:
                    pass
                time.sleep(0.1)
            else:
                raise TimeoutError(f'{mode} 서버 시작 제한 시간 초과')
            startup_ms = (time.perf_counter() - started) * 1000
            result = verify(url, csv_path)
            if result['loading_mode'] != mode:
                raise AssertionError('다른 서버의 응답입니다. 사용하지 않는 포트를 지정하세요.')
            expected_loaded = mode == 'eager'
            if result['health_before']['model_loaded'] != expected_loaded:
                raise AssertionError(f'{mode} 최초 로딩 상태가 예상과 다릅니다.')
            return {'startup_ms': round(startup_ms, 1), **result}
        finally:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def main():
    parser = argparse.ArgumentParser(description='별도 프로세스에서 Eager/Lazy 비교 측정')
    parser.add_argument('--port', type=int, default=8100)
    parser.add_argument('--csv', default=settings.training_data_path)
    parser.add_argument('--output-dir', default='/tmp/jimjak-loading-evidence')
    args = parser.parse_args()
    directory = Path(args.output_dir)
    results = [measure(mode, args.port, args.csv, directory) for mode in ('eager', 'lazy')]
    text = json.dumps(results, ensure_ascii=False, indent=2)
    (directory / 'loading_modes.json').write_text(text + '\n', encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()

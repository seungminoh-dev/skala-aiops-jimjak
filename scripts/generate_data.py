import os
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

# ----------------------------------------------------
# 1. 기획서 기준 좌석 수 매핑 테이블 (25종 대표값)
# ----------------------------------------------------
SEAT_MAP = {
    "E95": 120, "223": 140, "319": 140, "320": 180, "32N": 180,
    "321": 200, "32Q": 200, "738": 189, "73H": 189, "7M8": 189,
    "739": 190, "788": 240, "332": 250, "763": 250, "333": 280,
    "789": 280, "339": 300, "772": 300, "359": 310, "781": 330,
    "773": 340, "77W": 340, "351": 350, "748": 370, "388": 490,
}

AIRLINE_CODES = ["KE", "OZ", "7C", "LJ", "TW", "ZE", "UA", "DL", "CX"]

def simulate_line_data(
    num_flights: int,
    start_time: datetime,
    scenario_type: str = "normal",
    line_id: str = "T1-03",
    random_seed: int = 42,
) -> pd.DataFrame:
    np.random.seed(random_seed)

    records = []
    curr_time = start_time
    prev_bag_last_dt = None  # 앞 비행기 작업 종료 시간 기억용

    subtypes = list(SEAT_MAP.keys())
    
    # 기종 샘플링 가중치 복구
    weights = [
        0.02, 0.03, 0.03, 0.08, 0.08, 0.08, 0.08,  # E95 ~ 32Q
        0.15, 0.05, 0.05, 0.04,  # 738, 73H, 7M8, 739
        0.04, 0.05, 0.03, 0.05, 0.05,  # 788 ~ 789
        0.03, 0.03, 0.03, 0.02,  # 339 ~ 781
        0.02, 0.02, 0.01, 0.01, 0.02,  # 773 ~ 388
    ]
    weights = np.array(weights) / sum(weights)

    for i in range(num_flights):
        interval = np.random.randint(50, 95)
        curr_time += timedelta(minutes=interval)
        
        flight_id = f"{np.random.choice(AIRLINE_CODES)}{np.random.randint(100, 999)}"
        subtype = np.random.choice(subtypes, p=weights)
        seats = SEAT_MAP.get(subtype, 200)
        
        # 1. 산식 수정: 기획서 수치(소형 12분, 대형 20분) 정밀 반영[cite: 6]
        base_unload = 4.0 + (seats / 100.0) * 4.5 
        noise = np.random.normal(loc=0.0, scale=3.5)
        
        # 임시 착륙 시간 (병목 계산을 위해 먼저 구함)
        landing_dt = curr_time + timedelta(minutes=int(np.random.randint(-15, 15)))
        
        # 2. 앞 편 때문에 밀린 시간 추가 (벨트 점유 병목 누적)[cite: 6]
        delay_from_prev = 0.0
        if prev_bag_last_dt and landing_dt < prev_bag_last_dt:
            delay_from_prev = (prev_bag_last_dt - landing_dt).total_seconds() / 60.0
            delay_from_prev = min(delay_from_prev, 15.0) # 무한정 지연 방지
            
        base_wait = 8.0 + 13.0 + base_unload + delay_from_prev + noise
        event_tag = ""
        
        # 3. 시나리오별 처리 변형
        if scenario_type == "normal":
            final_wait = base_wait
            
        elif scenario_type == "bhs_failure":
            if 50 <= i < 54:
                final_wait = base_wait + np.random.uniform(20.0, 40.0)
                event_tag = "bhs_failure"
            else:
                final_wait = base_wait
                
        elif scenario_type == "staff_shortage":
            final_wait = base_wait * 1.30
            event_tag = ""
            
        elif scenario_type == "expansion":
            final_wait = base_wait * 0.80
            event_tag = ""
            
        elif scenario_type == "terminal_open":
            if i < 220:
                final_wait = base_wait + np.random.uniform(15.0, 30.0)
                event_tag = "terminal_open"
            else:
                final_wait = base_wait * 0.90
                event_tag = ""
                
        elif scenario_type == "process_change":
            final_wait = (base_wait * 1.15) + np.random.normal(0, 6.0)
            event_tag = ""
            
        else:
            final_wait = base_wait

        wait_min = int(max(20, round(final_wait)))
        
        eta_dt = curr_time
        bag_last_dt = landing_dt + timedelta(minutes=wait_min)
        
        # 다음 루프를 위해 현재 비행기 완료 시간 저장
        prev_bag_last_dt = bag_last_dt 
        
        terminal_id = "P01" if line_id.startswith("T1") else "P03"
        carousel_id = line_id.split("-")[1].lstrip("0")
        
        records.append({
            "flightId": flight_id,
            "terminalId": terminal_id,
            "bagCarouselId": carousel_id,
            "line_id": line_id,
            "aircraftSubtype": subtype,
            "seats": seats,
            "estimatedDatetime": eta_dt.strftime("%Y%m%d%H%M"),
            "landingDatetime": landing_dt.strftime("%Y%m%d%H%M"), # 3. 대문자 L 수정 반영[cite: 6]
            "bagLastTime": bag_last_dt.strftime("%Y%m%d%H%M"),
            "wait_min": wait_min,
            "event_tag": event_tag,
        })
        
    return pd.DataFrame(records)

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(base_dir, "data")
    os.makedirs(output_dir, exist_ok=True)

    start_base = datetime(2026, 8, 1, 0, 0)

    print("Generating train_normal.csv (960 flights)...")
    df_train = simulate_line_data(num_flights=960, start_time=start_base, scenario_type="normal", random_seed=101)
    df_train.to_csv(os.path.join(output_dir, "train_normal.csv"), index=False)

    print("Generating normal_2w.csv (220 flights)...")
    df_normal_2w = simulate_line_data(num_flights=220, start_time=start_base + timedelta(days=61), scenario_type="normal", random_seed=102)
    df_normal_2w.to_csv(os.path.join(output_dir, "normal_2w.csv"), index=False)

    print("Generating bhs_failure_2w.csv (220 flights)...")
    df_bhs = simulate_line_data(num_flights=220, start_time=start_base + timedelta(days=61), scenario_type="bhs_failure", random_seed=103)
    df_bhs.to_csv(os.path.join(output_dir, "bhs_failure_2w.csv"), index=False)

    print("Generating staff_shortage_2w.csv (220 flights)...")
    df_staff = simulate_line_data(num_flights=220, start_time=start_base + timedelta(days=61), scenario_type="staff_shortage", random_seed=104)
    df_staff.to_csv(os.path.join(output_dir, "staff_shortage_2w.csv"), index=False)

    print("Generating expansion_2w.csv (220 flights)...")
    df_exp = simulate_line_data(num_flights=220, start_time=start_base + timedelta(days=61), scenario_type="expansion", random_seed=105)
    df_exp.to_csv(os.path.join(output_dir, "expansion_2w.csv"), index=False)

    print("Generating terminal_open_4w.csv (450 flights)...")
    df_term = simulate_line_data(num_flights=450, start_time=start_base + timedelta(days=61), scenario_type="terminal_open", random_seed=106)
    df_term.to_csv(os.path.join(output_dir, "terminal_open_4w.csv"), index=False)

    print("Generating process_change_2w.csv (220 flights)...")
    df_proc = simulate_line_data(num_flights=220, start_time=start_base + timedelta(days=61), scenario_type="process_change", random_seed=107)
    df_proc.to_csv(os.path.join(output_dir, "process_change_2w.csv"), index=False)

    print(f"\n[성공] 모든 시나리오 CSV 파일이 {output_dir} 경로에 생성되었습니다.")

if __name__ == "__main__":
    main()
#!/usr/bin/env bash
# Все тесты подряд. Падает на первой ошибке. Запуск: bash tests/run_all.sh
set -e
cd "$(dirname "$0")/.."
python3 build.py
python3 tests/check_code.py
python3 tests/check_modules.py
node tests/test_analysis.js
node tests/test_server.js
node tests/synth.js
node tests/test_songs.js
for t in smoke_ui sim_data sim_ball sim_game sim_range sim_warmup sim_voice sim_cam sim_diary sim_profiles sim_songs sim_learn; do
  echo "== $t"; python3 tests/$t.py
done
echo "Все тесты прошли"

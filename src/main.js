// ===== Точка входа: собирает модули, регистрирует экраны и запускает приложение =====
// Ядро (core) ничего не знает про экраны и игры: всё подключение - здесь.
import * as core_analysis from './core/analysis.js';
import * as core_audio from './core/audio.js';
import * as core_piano from './core/piano.js';
import * as core_router from './core/router.js';
import * as core_store from './core/store.js';
import * as core_ui from './core/ui.js';
import * as core_util from './core/util.js';
import * as data_exercises from './data/exercises.js';
import * as trainer_check from './trainer/check.js';
import * as trainer_exercise from './trainer/exercise.js';
import * as trainer_exercises from './trainer/exercises.js';
import * as trainer_logic from './trainer/logic.js';
import * as trainer_recorder from './trainer/recorder.js';
import * as trainer_tap from './trainer/tap.js';
import * as features_ball from './features/ball.js';
import * as features_cam from './features/cam.js';
import * as features_diary from './features/diary.js';
import * as features_game from './features/game.js';
import * as features_learn from './features/learn.js';
import * as features_range from './features/range.js';
import * as features_register from './features/register.js';
import * as features_voice from './features/voice.js';
import * as features_warmup from './features/warmup.js';
import * as screens_history from './screens/history.js';
import * as screens_notes from './screens/notes.js';
import * as screens_profiles from './screens/profiles.js';
import * as screens_settings from './screens/settings.js';
import * as screens_today from './screens/today.js';
import { registerRoute, registerPrefix, beforeRender, onLeave, start } from './core/router.js';

const { viewToday } = screens_today, { viewHistory } = screens_history, { viewNotes } = screens_notes;
const { viewExercises } = trainer_exercises, { viewExercise } = trainer_exercise, { viewCheck } = trainer_check;
const { exById } = data_exercises;

// --- экраны
registerRoute('today', viewToday);
registerRoute('exercises', viewExercises);
registerRoute('check', viewCheck);
registerRoute('history', viewHistory);
registerRoute('notes', viewNotes);
registerRoute('ball', features_ball.viewBall, 'ball');
registerRoute('game', features_game.viewGame, 'ball');
registerRoute('range', features_range.viewRange);
registerRoute('warmup', features_warmup.viewWarmup);
registerRoute('learn', features_learn.viewLearn);
registerRoute('voice', features_voice.viewVoice, 'exercises');
registerRoute('diary', features_diary.viewDiary);
registerPrefix('ex-', id => viewExercise(exById(id)), 'exercises', id => !!exById(id));
registerPrefix('game-', n => features_game.viewGameLevel(+n), 'ball', n => /^\d+$/.test(n));
registerPrefix('ball-', n => features_ball.viewBallLevel(+n), 'ball', n => /^\d+$/.test(n));
registerPrefix('voice-', id => features_voice.viewVoiceSet(id), 'exercises', id => !!features_voice.voiceSet(id));

// --- что остановить перед сменой экрана (порядок важен: игры и микрофон, потом камера)
beforeRender(features_game.gameStop);
beforeRender(features_ball.ballRebuild); // задания «Шарика» зависят от окна голоса (база, замер)
beforeRender(features_ball.ballStop);
beforeRender(features_range.rangeStop);
beforeRender(features_warmup.warmupStop);
beforeRender(features_voice.voiceStop);
beforeRender(features_diary.diaryStop);
beforeRender(features_cam.camOff);
onLeave(trainer_recorder.stopRecordingIfAny);

// --- мост в window (переходный период): кнопки в разметке пока вызывают функции по имени (onclick="go('ball')"),
// а тесты читают состояние. Внутри модулей window не используется - только import.
// Следующий шаг (ARCHITECTURE.md, этап 2б): кнопки через data-action, мост сократить до тестового.
for (const ns of [core_analysis, core_audio, core_piano, core_router, core_store, core_ui, core_util, data_exercises, trainer_check, trainer_exercise, trainer_exercises, trainer_logic, trainer_recorder, trainer_tap, features_ball, features_cam, features_diary, features_game, features_learn, features_range, features_register, features_voice, features_warmup, screens_history, screens_notes, screens_profiles, screens_settings, screens_today]) {
  for (const k of Object.keys(ns)) {
    if (k.startsWith('__set_')) continue;
    const set = ns['__set_' + k];
    Object.defineProperty(window, k, { get: () => ns[k], set: set ? v => set(v) : undefined, configurable: true });
  }
}

document.getElementById('gear').innerHTML = core_util.ICON.gear;
start();

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
import * as features_songlib from './features/songlib.js';
import * as features_songs from './features/songs.js';
import * as data_songs from './data/songs.js';
import * as screens_history from './screens/history.js';
import * as screens_notes from './screens/notes.js';
import * as screens_profiles from './screens/profiles.js';
import * as screens_settings from './screens/settings.js';
import * as screens_today from './screens/today.js';
import { registerRoute, registerPrefix, beforeRender, onLeave, start } from './core/router.js';
import { registerActions, initActions } from './core/actions.js';
const NAMESPACES = [core_analysis, core_audio, core_piano, core_router, core_store, core_ui, core_util, data_exercises, trainer_check, trainer_exercise, trainer_exercises, trainer_logic, trainer_recorder, trainer_tap, features_ball, features_cam, features_diary, features_game, features_learn, features_range, features_register, features_voice, features_warmup, features_songlib, features_songs, data_songs, screens_history, screens_notes, screens_profiles, screens_settings, screens_today];

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
registerRoute('songs', features_songs.viewSongs, 'exercises');
registerPrefix('ex-', id => viewExercise(exById(id)), 'exercises', id => !!exById(id));
registerPrefix('game-', n => features_game.viewGameLevel(+n), 'ball', n => /^\d+$/.test(n));
registerPrefix('ball-', n => features_ball.viewBallLevel(+n), 'ball', n => /^\d+$/.test(n));
registerPrefix('song-', id => features_songs.viewSong(id), 'exercises', id => !!features_songs.songById(id));
registerPrefix('learn-', features_learn.viewLesson, 'learn', features_learn.learnValid);
registerPrefix('voice-', id => features_voice.viewVoiceSet(id), 'exercises', id => !!features_voice.voiceSet(id));

// --- что остановить перед сменой экрана (порядок важен: игры и микрофон, потом камера)
beforeRender(features_game.gameStop);
beforeRender(features_ball.ballRebuild); // задания «Шарика» зависят от окна голоса (база, замер)
beforeRender(features_ball.ballStop);
beforeRender(features_range.rangeStop);
beforeRender(features_warmup.warmupStop);
beforeRender(features_voice.voiceStop);
beforeRender(features_diary.diaryStop);
beforeRender(features_songs.songStop);
beforeRender(features_cam.camOff);
onLeave(trainer_recorder.stopRecordingIfAny);

// --- действия кнопок: всё, что можно вызвать из разметки (data-action / data-change / data-input). Только этот список.
registerActions({
  answerQuiz: trainer_exercise.answerQuiz,
  applyImport: screens_settings.applyImport,
  askDelete: screens_history.askDelete,
  askReset: screens_settings.askReset,
  calibrate: screens_settings.calibrate,
  camSet: features_cam.camSet,
  camShare: features_cam.camShare,
  cancelImport: screens_settings.cancelImport,
  closeSheet: core_ui.closeSheet,
  copyData: screens_settings.copyData,
  delNote: screens_notes.delNote,
  diaryDel: features_diary.diaryDel,
  diaryMakeCompare: features_diary.diaryMakeCompare,
  diaryNextQ: features_diary.diaryNextQ,
  diaryPlay: features_diary.diaryPlay,
  diaryRec: features_diary.diaryRec,
  diaryRecStop: features_diary.diaryRecStop,
  diaryShare: features_diary.diaryShare,
  doDelete: screens_history.doDelete,
  editNote: screens_notes.editNote,
  exportData: screens_settings.exportData,
  go: core_router.go,
  goCloseSheet: features_register.goCloseSheet,
  importFile: screens_settings.importFile,
  learnPlay: features_learn.learnPlay,
  learnQuiz: features_learn.learnQuiz,
  learnQuizAns: features_learn.learnQuizAns,
  learnQuizPlay: features_learn.learnQuizPlay,
  nextQuiz: trainer_exercise.nextQuiz,
  openProfiles: screens_profiles.openProfiles,
  openSettings: screens_settings.openSettings,
  pianoTap: core_piano.pianoTap,
  playAudioLast: trainer_recorder.playAudioLast,
  playEx: trainer_exercise.playEx,
  playExFirst: trainer_exercise.playExFirst,
  playInterval: trainer_exercise.playInterval,
  playNotes: core_audio.playNotes,
  playQ: trainer_exercise.playQ,
  playRhythmEx: trainer_exercise.playRhythmEx,
  profAddFrom: screens_profiles.profAddFrom,
  profDel: screens_profiles.profDel,
  profRenameFrom: screens_profiles.profRenameFrom,
  profSwitch: screens_profiles.profSwitch,
  quizSample: trainer_exercise.quizSample,
  rangeDone: features_range.rangeDone,
  rangeMarkBreak: features_range.rangeMarkBreak,
  rangeNoFalsetto: features_range.rangeNoFalsetto,
  rangeSetBreak: features_range.rangeSetBreak,
  rangeStart: features_range.rangeStart,
  rangeWork: features_range.rangeWork,
  resetAll: screens_settings.resetAll,
  saveMelody: trainer_check.saveMelody,
  saveNote: screens_notes.saveNote,
  saveSession: trainer_exercise.saveSession,
  selectMelody: trainer_check.selectMelody,
  setExFilter: trainer_exercises.setExFilter,
  setRating: trainer_exercise.setRating,
  setStrict: features_register.setStrict,
  setTol: features_ball.setTol,
  setVoice: features_register.setVoice,
  setWuMode: features_warmup.setWuMode,
  showTol: features_ball.showTol,
  songAskDel: features_songs.songAskDel,
  songCancel: features_songs.songCancel,
  songDel: features_songs.songDel,
  songFile: features_songs.songFile,
  songGoPhrase: features_songs.songGoPhrase,
  songNext: features_songs.songNext,
  songPickTrack: features_songs.songPickTrack,
  songPlay: features_songs.songPlay,
  songPreview: features_songs.songPreview,
  songRecord: features_songs.songRecord,
  songSave: features_songs.songSave,
  songSetMode: features_songs.songSetMode,
  songSetTempo: features_songs.songSetTempo,
  songShiftBy: features_songs.songShiftBy,
  startQuiz: trainer_exercise.startQuiz,
  stepBase: features_register.stepBase,
  stopAll: core_audio.stopAll,
  toggleChapter: features_ball.toggleChapter,
  toggleCrit: trainer_exercise.toggleCrit,
  voiceNextStep: features_voice.voiceNextStep,
  voicePlay: features_voice.voicePlay,
  warmupNext: features_warmup.warmupNext,
  warmupPlay: features_warmup.warmupPlay,
  wuSaveRange: features_warmup.wuSaveRange,
});
initActions();

// --- мост для автотестов: Playwright управляет браузером (navigator.webdriver = true) и читает состояние по именам.
// У людей мост не включается: функции приложения не видны снаружи.
if (navigator.webdriver) {
  for (const ns of NAMESPACES) {
    for (const k of Object.keys(ns)) {
      if (k.startsWith('__set_')) continue;
      const set = ns['__set_' + k];
      Object.defineProperty(window, k, { get: () => ns[k], set: set ? v => set(v) : undefined, configurable: true });
    }
  }
}

document.getElementById('gear').innerHTML = core_util.ICON.gear;
start();

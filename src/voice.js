// ===== Голос и речь: актёрские и логопедические упражнения. Маршруты #voice и #voice-<id> =====
// Виды шагов: timer (таймер), beat (метроном, слоги/текст по щелчку), text (скороговорки/фразы по очереди),
// piano (пианино играет фразы по тональностям), mpt (замер: длинный звук на «а»), exhale (замер: выдох на «с»).
// Замеры честные: считаем только время, пока микрофон слышит голос (mpt) или шум выдоха (exhale), паузы до 0.6 с допускаются.
const TWISTERS = [
  'Шла Саша по шоссе и сосала сушку', 'Карл у Клары украл кораллы, а Клара у Карла украла кларнет', 'На дворе трава, на траве дрова',
  'Ехал Грека через реку, видит Грека: в реке рак', 'От топота копыт пыль по полю летит', 'Курил турка трубку, клевала курка крупку',
  'Сшит колпак не по-колпаковски, вылит колокол не по-колоколовски', 'Бык тупогуб, тупогубенький бычок, у быка бела губа была тупа',
  'Четыре чёрненьких чумазеньких чертёнка чертили чёрными чернилами чертёж', 'Мама мыла Милу мылом, Мила мыло не любила',
  'Расскажите про покупки. Про какие про покупки? Про покупки, про покупки, про покупочки мои', 'Ткёт ткач ткани на платки Тане',
];
const PHRASES = ['Мама мыла раму', 'Утро было тихим и тёплым', 'Я говорю спокойно и уверенно', 'Вечером мы пойдём гулять по набережной',
  'Ветер гнал по небу лёгкие облака', 'Моё имя звучит ровно и свободно'];
// сочетания «три согласных + гласная» (как КПТИ, ГДБИ, РЛМИ): каждый ряд проходит 10 гласных
const CL_VOW = ['И', 'Э', 'А', 'О', 'У', 'Ы', 'Е', 'Я', 'Ё', 'Ю'];
const CL_HARD = ['ПТК', 'ПКТ', 'ТПК', 'ТКП', 'КПТ', 'КТП', 'БДГ', 'БГД', 'ДБГ', 'ДГБ', 'ГБД', 'ГДБ'];
const CL_SOFT = ['РЛМ', 'РМЛ', 'ЛРМ', 'МЛР', 'НРЛ', 'ПТР', 'ПКР', 'КТР', 'ДБР', 'ГДР', 'ШТР', 'ЗДР', 'ВЗЖ', 'ФСШ'];
// ряды на сегодня: n рядов подряд по кругу, каждый день следующие
function clRows(list, n) { const d = Math.floor(Date.now() / 864e5), off = (d * n) % list.length; return Array.from({ length: n }, (_, k) => list[(off + k) % list.length]); }
const clSyl = rows => rows.flatMap(r => CL_VOW.map(v => r + v));
const VOICE_SETS = [
  { id: 'relax', icon: '🧘', title: 'Снять зажимы', desc: 'Лицо, челюсть, шея, язык. Свободный голос начинается с расслабленных мышц.', steps: [
    { t: 'Зевок', how: 'Сладко зевни с открытым ртом. Почувствуй, как поднимается нёбо и опускается гортань. На выдохе лёгкий вздох голосом. 4 раза.', sec: 40 },
    { t: 'Массаж лица', how: 'Кончиками пальцев разомни лоб, виски, скулы и жевательные мышцы у ушей. Челюсть висит свободно.', sec: 45 },
    { t: 'Тяжёлая челюсть', how: 'Опусти челюсть, будто она тяжёлая, и покачай её рукой из стороны в сторону. Сама челюсть не помогает.', sec: 30 },
    { t: 'Лошадка', how: 'Фыркай расслабленными губами «пррр» на выдохе, без голоса, потом с голосом.', sec: 25 },
    { t: 'Шея', how: 'Медленные полукруги головой от плеча к плечу через грудь. Назад не запрокидывай.', sec: 40 },
    { t: 'Плечи', how: 'На вдохе подними плечи к ушам, на выдохе брось вниз. 5 раз.', sec: 30 },
    { t: 'Язык', how: 'Покрути языком по кругу между губами и зубами: 5 раз в одну сторону, 5 в другую.', sec: 40 },
    { t: 'Вздох облегчения', how: 'На выдохе расслабленное «ммм-а» сверху вниз, как вздох после трудного дня.', sec: 30 },
  ] },
  { id: 'breath', icon: '🌬️', title: 'Дыхание и опора', desc: 'Дыхание животом, длинный ровный выдох. На нём держится и пение, и спокойная речь.', steps: [
    { t: 'Ладонь на животе', how: 'Встань прямо, ладонь на живот. Вдох носом - живот мягко вперёд, плечи на месте. Выдох ртом - живот возвращается.', sec: 40 },
    { t: 'Нюхаем цветок', how: 'Короткий спокойный вдох носом, как будто нюхаешь цветок, и медленный выдох через рот. 6 раз.', sec: 60 },
    { t: 'Свеча', how: 'Дуй на воображаемую свечу так, чтобы пламя только колебалось, но не гасло. Выдох длинный и ровный.', sec: 40 },
    { t: 'Толчки на «ф»', how: 'Короткие выдохи «ф! ф! ф!» с толчком живота. Плечи и горло не участвуют. 3 раза по 10.', sec: 35 },
    { t: 'Собачка', how: 'Частое лёгкое дыхание ртом, как у собачки в жару. Работает живот. 3 раза по 10 секунд с отдыхом.', sec: 45 },
    { t: 'Счёт на выдохе', how: 'Вдох, и на одном выдохе спокойно считай вслух: раз, два, три... Без напряжения. Запомни, до скольких получилось.', sec: 45 },
    { t: 'Замер: долгий выдох', how: 'Вдохни и выдыхай на ровное тихое «с-с-с» как можно дольше. Секундомер идёт, пока слышно «с».', kind: 'exhale' },
  ] },
  { id: 'reso', icon: '🔔', title: 'Резонанс и сильный голос', desc: 'Голос звучит громче без крика, когда работают резонаторы и опора.', steps: [
    { t: 'Мычание', how: 'Мычи «ммм» на удобной ноте, губы сомкнуты, зубы разжаты. Положи ладонь на грудь, потом на нос: почувствуй вибрацию.', sec: 40 },
    { t: 'Мня-мня', how: 'Жуй, как будто во рту ириска, и мычи: «мня-мня-мня». Звук свободный, вибрирует в губах.', sec: 30 },
    { t: 'Колокол', how: 'Низко и гулко: «бо-о-ом», «би-и-им», «ба-а-ам». Тяни «м» в конце, чувствуй вибрацию в груди.', sec: 45 },
    { t: 'Гласные на опоре', how: 'На одном выдохе связно: «и-э-а-о-у». Звук летит вперёд, в стену напротив.', sec: 45 },
    { t: 'Позвать через комнату', how: 'Позови: «Э-эй!», «Алло-о!», «Ау-у!» Без крика: громкость идёт от дыхания, горло свободно.', sec: 40 },
    { t: 'Замер: длинный звук', how: 'Вдохни и тяни «а-а-а» на удобной ноте, спокойно и ровно, сколько получится. Секундомер идёт, пока звучит голос.', kind: 'mpt' },
  ] },
  { id: 'diction', icon: '👄', title: 'Дикция', desc: 'Губы и язык работают точно, речь становится ясной.', steps: [
    { t: 'Улыбка - трубочка', how: 'Широкая улыбка с зубами, потом губы вытянуть трубочкой. 10 раз, чётко.', sec: 30 },
    { t: 'Часики', how: 'Рот открыт, кончик языка ходит из уголка в уголок рта, как маятник.', sec: 30 },
    { t: 'Лошадка', how: 'Цокай языком, как лошадка копытами: громко, присасывая язык к нёбу.', sec: 20 },
    { t: 'Иголка - лопатка', how: 'Язык то узкий и острый, как иголка, то широкий и мягкий, как лопатка. По 5 раз.', sec: 30 },
    { t: 'Согласные', how: 'Чётко на каждый щелчок: «пт-к», «бд-г», «пт-к», «бд-г». Губы и язык точные, горло свободно.', kind: 'beat', bpm: 90, sec: 30, syl: ['ПТК', 'БДГ'] },
    { t: 'Скороговорки', how: 'Каждую: сначала медленно по слогам, потом в обычном темпе, потом быстро, но без каши. Нажимай «Следующая».', kind: 'text', list: 'twisters', n: 4 },
    { t: 'С пробкой', how: 'Зажми зубами ручку или палец поперёк рта и прочитай скороговорку чётко. Потом без неё: заметишь, как легко стало.', sec: 45 },
  ] },
  { id: 'pencil', icon: '✏️', title: 'С карандашом', desc: 'Карандаш в зубах мешает губам и языку, и им приходится работать в полную силу. Потом без карандаша речь звучит заметно чётче.', note: 'Карандаш чистый, держи его зубами поперёк рта, не прокусывай. Устала челюсть - сделай паузу.', steps: [
    { t: 'Карандаш в зубы', how: 'Зажми карандаш поперёк рта между зубами, ближе к клыкам. Губы и язык свободны. Говори громко и старайся, чтобы каждый звук был слышен.', sec: 15 },
    { t: 'Пары: глухой - звонкий', how: 'По одной тройке слогов на щелчок, чётко и с силой.', kind: 'beat', bpm: 40, sec: 36, syl: ['пе-пе-пе', 'бе-бе-бе', 'те-те-те', 'де-де-де', 'ке-ке-ке', 'ге-ге-ге'] },
    { t: 'КПТИ, ГДБИ...', how: 'Три согласных и гласная - на каждый щелчок: КПТИ, КПТЭ, КПТА... Согласные вылетают слитно, без лишнего «ы» между ними. Каждый день другие ряды.', kind: 'beat', bpm: 60, sec: 40, syl: () => clSyl(clRows(CL_HARD, 4)) },
    { t: 'РЛМИ и сочетания с «р»', how: 'То же: РЛМИ, РЛМЭ, РЛМА... «Р» раскатистое, язык работает в полную силу.', kind: 'beat', bpm: 60, sec: 40, syl: () => clSyl(clRows(CL_SOFT, 4)) },
    { t: 'Короткие сочетания', how: 'Медленно, потом быстрее.', kind: 'beat', bpm: 44, sec: 33, syl: ['ПТР', 'КР', 'ПРЛ', 'ТР', 'ПКР', 'ШР', 'ДР', 'ГР', 'БРЛ', 'ТКР', 'ВЗР', 'СТР'] },
    { t: 'Стечения быстрее', how: 'Пара за парой на щелчок: «тр - др», «кл - гл», «стр - здр», потом «кпт», «кфт», «ктщ».', kind: 'beat', bpm: 52, sec: 30, syl: ['ТР - ДР', 'КЛ - ГЛ', 'СТР - ЗДР', 'КПТ', 'КФТ', 'КТЩ'] },
    { t: 'Скороговорки с карандашом', how: 'С карандашом в зубах: медленно и чётко, каждый звук. Нажимай «Следующая».', kind: 'text', list: 'twisters', n: 3 },
    { t: 'Без карандаша', how: 'Убери карандаш и скажи те же скороговорки и сочетания. Услышь, насколько легче и чётче стало.', sec: 40 },
  ] },
  { id: 'fluency', icon: '🌊', title: 'Плавная речь', desc: 'Речь на выдохе, мягкое начало звука, ровный ритм. Упражнения актёров и логопедов для спокойной плавной речи.', note: 'Если есть заикание, эти упражнения хорошо делать регулярно, а ещё лучше - вместе со специалистом.', steps: [
    { t: 'Вдох перед фразой', how: 'Перед каждой фразой короткий спокойный вдох носом. Говорим только на выдохе. Попробуй: вдох - «Доброе утро». Вдох - «Как дела?»', sec: 40 },
    { t: 'Мягкое начало', how: 'Начинай гласные мягко, с лёгкого выдоха, без толчка в горле: «(х)а-а», «(х)о-о», «(х)у-у», «(х)и-и».', sec: 40 },
    { t: 'Слоги под метроном', how: 'По одному слогу на щелчок, плавно и связно, без пауз между слогами.', kind: 'beat', bpm: 60, sec: 40, syl: ['ма', 'мо', 'му', 'мы', 'па', 'по', 'пу', 'пы'] },
    { t: 'Быстрее', how: 'То же, но чуть быстрее. Плавность важнее скорости.', kind: 'beat', bpm: 84, sec: 30, syl: ['ла', 'ло', 'лу', 'лы', 'та', 'то', 'ту', 'ты'] },
    { t: 'Фраза на одном выдохе', how: 'Скажи фразу протяжно и слитно, как будто поёшь: все слова одним потоком. Потом в обычном темпе, сохраняя плавность.', kind: 'text', list: 'phrases', n: 4 },
    { t: 'Стихи в ритме', how: 'Читай вслух, отстукивая ладонью по колену ударные слоги: «Мороз и солнце, день чудесный! Ещё ты дремлешь, друг прелестный...»', kind: 'beat', bpm: 66, sec: 45 },
    { t: 'Медленное чтение', how: 'Возьми любой текст и прочитай абзац в два раза медленнее обычного, с паузами на запятых и точках. Пауза - это нормально.', sec: 60 },
  ] },
  { id: 'low', icon: '🎚️', title: 'Низкий голос', desc: 'Опустить гортань, раскрыть грудной резонанс, мягко расширить низ.', steps: [
    { t: 'Зевок-вздох вниз', how: 'Зевни и на выдохе съезжай голосом сверху вниз на «а-а-а», до самого низа. Без нажима.', sec: 40 },
    { t: 'Гудение', how: 'Низкое «у-у-у» с ладонью на груди. Найди ноту, где грудь вибрирует сильнее всего, и погуди на ней.', sec: 40 },
    { t: 'Усталое «ох»', how: 'Тяжёлый расслабленный выдох «о-ох» вниз, как после долгого дня. Без хрипа и давления.', sec: 30 },
    { t: 'Спуск с пианино', how: 'Пой за пианино на «а», мягко. Тональность опускается к твоему низу. Внизу лучше тише, чем с хрипом.', kind: 'piano', from: 'low' },
    { t: 'Речь ниже', how: 'Скажи «Добрый день, меня зовут...» в обычной высоте, потом чуть ниже, ещё чуть ниже. Остановись там, где голос звучит, а не хрипит.', sec: 45 },
  ] },
  { id: 'wide', icon: '↕️', title: 'Шире диапазон', desc: 'Гибкость голоса: скольжения и скачки через весь диапазон.', steps: [
    { t: 'Сирена', how: 'На «у» скользи снизу вверх и обратно, как сирена. Каждый раз чуть выше и чуть ниже, без нажима.', sec: 40 },
    { t: 'Трель-горка', how: 'Губная трель «бррр» со скольжением снизу вверх и вниз.', sec: 30 },
    { t: 'Сова', how: '«У-ху!» - лёгкий скачок вверх и обратно, как сова. Наверху можно в фальцет.', sec: 30 },
    { t: 'Скачки с пианино', how: 'Пой за пианино на «а»: до-соль-до-соль-до. Тональность поднимается.', kind: 'piano', from: 'mid', pat: [0, 7, 12, 7, 0] },
    { t: 'Замер: длинный звук', how: 'Тяни «а-а-а» на удобной ноте ровно и спокойно, сколько получится.', kind: 'mpt' },
  ] },
];
const voiceSet = id => VOICE_SETS.find(s => s.id === id);
function voiceState() { state.voice ||= { done: [], rec: { mpt: [], exhale: [] } }; state.voice.rec ||= { mpt: [], exhale: [] }; return state.voice; }
// следующий комплекс по кругу: после последнего сделанного
function voiceNext() { const d = voiceState().done; if (!d.length) return VOICE_SETS[0]; const i = VOICE_SETS.findIndex(s => s.id === d[d.length - 1].id); return VOICE_SETS[(i + 1) % VOICE_SETS.length]; }
const voiceDoneToday = () => voiceState().done.some(x => x.date.slice(0, 10) === ymd());
const stepSec = s => s.sec || (s.kind === 'text' ? s.n * 25 : s.kind === 'piano' ? 50 : s.kind === 'mpt' || s.kind === 'exhale' ? 40 : 30);
const setMin = set => Math.max(1, Math.round(set.steps.reduce((a, s) => a + stepSec(s), 0) / 60));
const recBest = k => { const r = voiceState().rec[k] || []; return r.length ? r.reduce((a, x) => x.sec > a.sec ? x : a) : null; };
const recLast = k => { const r = voiceState().rec[k] || []; return r[r.length - 1] || null; };
// секундомер звука (чистая функция, тест: tests/sim_voice.py): идёт, пока active; паузы до 0.6 с не обрывают
function phonStep(P, now, active) {
  if (P.done) return P;
  if (active) { if (P.start == null) P.start = now; P.last = now; }
  else if (P.start != null && now - P.last > .6) P.done = true;
  P.sec = P.start == null ? 0 : P.last - P.start;
  return P;
}
let VS = null;
function voiceStop() {
  if (!VS) return; clearInterval(VS.tick); clearTimeout(VS.timer); (VS.timers || []).forEach(clearTimeout); VS.timers = []; stopAll(); cancelAnimationFrame(VS.raf);
  if (VS.stream) { if (VS.stream !== CAM.mic) { VS.stream.getTracks().forEach(t => t.stop()); afterMic(); } VS.stream = null; }
  VS.playing = false; busy = false;
}
function recLine(k, name) {
  const b = recBest(k), l = recLast(k);
  return `<div class="row between small"><span>${name}</span><span>${b ? `<b>${b.sec.toFixed(1)} с</b> <span class="muted">лучший${l && l !== b ? `, последний ${l.sec.toFixed(1)} с` : ''}</span>` : '<span class="muted">ещё не замерял</span>'}</span></div>`;
}
function viewVoice() {
  const v = voiceState(), nx = voiceNext(), days = new Set(v.done.map(x => x.date.slice(0, 10))).size;
  let h = `<button class="back" onclick="go('today')">${ICON.back} Сегодня</button><h1>Голос и речь</h1>
    <p class="muted" style="margin:6px 0 0">Актёрские и логопедические упражнения: расслабить лицо и горло, поставить дыхание, сделать голос звучнее и ниже, речь чёткой и плавной. По 4-6 минут, лучше каждый день.</p>
    <button class="item sec" style="margin-top:14px" onclick="go('voice-${nx.id}')"><div class="dot rhythm">${voiceDoneToday() ? '✓' : nx.icon}</div><div class="t"><b>${voiceDoneToday() ? 'Сегодня уже сделано. Ещё один?' : 'Комплекс дня'}: ${nx.title}</b><span class="small muted">${setMin(nx)} мин · ${esc(nx.desc)}</span></div><span class="muted">›</span></button>
    <div class="card sec stack"><h3>Мой прогресс</h3>${recLine('mpt', 'Длинный звук на «а»')}${recLine('exhale', 'Выдох на «с»')}
      <div class="tiny muted">Замеры в комплексах «Дыхание», «Резонанс» и «Шире диапазон». Секундомер идёт, только пока микрофон слышит звук.${days ? ` Занимался ${days} ${plural(days, 'день', 'дня', 'дней')}.` : ''}</div></div>
    <div class="sec"><h2>Все комплексы</h2>`;
  h += VOICE_SETS.map(s => { const n = v.done.filter(x => x.id === s.id).length; return `<button class="item" onclick="go('voice-${s.id}')"><div class="dot ear">${s.icon}</div><div class="t"><b>${s.title}</b><span class="small muted">${setMin(s)} мин · ${s.steps.length} ${plural(s.steps.length, 'упражнение', 'упражнения', 'упражнений')}${n ? ` · сделан ${n} ${plural(n, 'раз', 'раза', 'раз')}` : ''}</span></div><span class="muted">›</span></button>`; }).join('');
  return h + '</div>';
}
function viewVoiceSet(id) {
  voiceStop();
  const set = voiceSet(id); if (!set) return '<div class="empty">Комплекс не найден</div>';
  VS = { set, i: 0, playing: false, timers: [], tw: null };
  afterHooks.push(voiceDraw);
  afterHooks.push(() => { if (camOn()) camStart(); });
  return `<button class="back" onclick="go('voice')">${ICON.back} Голос и речь</button><h1>${set.icon} ${set.title}</h1>
    <p class="muted" style="margin:6px 0 0">${esc(set.desc)} Около ${setMin(set)} мин.</p>${set.note ? `<p class="tiny muted" style="margin:6px 0 0">${esc(set.note)}</p>` : ''}${camToggleHTML()}
    <div id="vsbox" class="sec"></div>`;
}
function vsList(s) {
  if (!VS.tw || VS.tw.step !== VS.i) {
    const src = s.list === 'twisters' ? TWISTERS : PHRASES, off = (Math.floor(Date.now() / 864e5) * s.n) % src.length;
    VS.tw = { step: VS.i, items: Array.from({ length: Math.min(s.n, src.length) }, (_, k) => src[(off + k) % src.length]), k: 0 };
  }
  return VS.tw;
}
function voiceDraw() {
  const box = $('#vsbox'); if (!box || !VS) return;
  const set = VS.set;
  if (VS.i >= set.steps.length) {
    box.innerHTML = `<div class="card stack" style="text-align:center"><div style="font-size:34px">${set.icon}</div><b>Комплекс «${set.title}» сделан</b>
      ${VS.measured ? `<div class="small">${VS.measured}</div>` : ''}
      <div class="row"><button class="btn" style="flex:1" onclick="go('voice')">Голос и речь</button><button class="btn ghost" style="flex:1" onclick="go('today')">На главную</button></div></div>`;
    return;
  }
  const s = set.steps[VS.i];
  let body = '';
  if (s.kind === 'text') { const tw = vsList(s); body = `<div id="vstext" style="font:700 21px Lora,serif;text-align:center;padding:8px 0">«${esc(tw.items[tw.k])}»</div><div class="tiny muted" style="text-align:center">${tw.k + 1} из ${tw.items.length}</div>`; }
  else if (s.kind === 'mpt' || s.kind === 'exhale') { const b = recBest(s.kind); body = `<div id="vsnow" style="text-align:center;font:800 40px Lora,serif">${VS.result != null ? VS.result.toFixed(1) + ' с' : '0.0 с'}</div>${VS.playing ? levelBar('vslvl') : ''}<div id="vssub" class="small muted" style="text-align:center;min-height:20px">${VS.resultText || (b ? 'Лучший: ' + b.sec.toFixed(1) + ' с' : 'Первый замер')}</div>`; }
  else body = `<div id="vsnow" style="text-align:center;font:800 26px Lora,serif;min-height:36px">${VS.playing ? '' : stepSec(s) + ' с'}</div><div id="vssub" class="small muted" style="text-align:center;min-height:20px"></div>`;
  const meas = (s.kind === 'mpt' || s.kind === 'exhale');
  const startLbl = meas ? (VS.playing ? ICON.stop + ' Стоп' : ICON.mic + (VS.result != null ? ' Ещё раз' : ' Начать замер')) : s.kind === 'text' ? 'Следующая' : VS.playing ? ICON.stop + ' Пауза' : ICON.play + ' Начать';
  box.innerHTML = `<div class="row" style="gap:4px;margin-bottom:10px">${set.steps.map((_, k) => `<i style="flex:1;height:5px;border-radius:3px;background:${k < VS.i ? 'var(--ok)' : k === VS.i ? 'var(--accent)' : 'var(--line)'}"></i>`).join('')}</div>
    <div class="card stack"><div class="tiny muted">${VS.i + 1} из ${set.steps.length}</div><h2 style="margin:0">${s.t}</h2><p class="small" style="margin:0">${esc(s.how)}</p>${body}
    ${meas && !MIC_DIRECT ? '<div class="note small">Для замера нужен живой микрофон: открой сайт в Safari или Chrome. Упражнение можно сделать и без замера.</div>' : ''}
    <div class="row">${meas && !MIC_DIRECT ? '' : `<button class="btn" style="flex:1" id="vsplay" onclick="voicePlay()">${startLbl}</button>`}<button class="btn ghost" ${meas && !MIC_DIRECT ? 'style="flex:1"' : ''} onclick="voiceNextStep()">Дальше ›</button></div></div>`;
}
function voiceNextStep() {
  voiceStop(); VS.i++; VS.result = null; VS.resultText = '';
  if (VS.i >= VS.set.steps.length) { voiceState().done.push({ date: nowLocal(), id: VS.set.id }); if (state.voice.done.length > 500) state.voice.done.shift(); save(); camRecStop(`${VS.set.title} ✓`); }
  voiceDraw();
}
// карточка для видео: комплекс, шаг и то, что сейчас крупно на экране (слог, скороговорка, секунды)
const vsPanel = () => { if (!VS) return {}; const s = VS.set.steps[VS.i]; if (!s) return { top: VS.set.title, big: 'Готово! ✓' };
  return { top: `${VS.set.title} · ${s.t}`, big: ($('#vstext') || $('#vsnow') || {}).textContent || s.t, sub: ($('#vssub') || {}).textContent || '' }; };
async function voicePlay() {
  if (!VS) return;
  if (camOn() && !camRecording()) await camSession(`Голос и речь · ${VS.set.title}`, vsPanel);
  const s = VS.set.steps[VS.i], sp = window.VS_SPEED || 1;
  if (s.kind === 'text') { const tw = vsList(s); if (tw.k < tw.items.length - 1) { tw.k++; voiceDraw(); } else voiceNextStep(); return; }
  if (VS.playing && VS.P && (s.kind === 'mpt' || s.kind === 'exhale')) return voiceMeasureDone(s, VS.P.sec);
  if (VS.playing) { voiceStop(); voiceDraw(); return; }
  const say = (a, b) => { if ($('#vsnow') && a != null) $('#vsnow').textContent = a; if ($('#vssub') && b != null) $('#vssub').textContent = b; };
  if (s.kind === 'mpt' || s.kind === 'exhale') return voiceMeasure(s);
  VS.playing = true; voiceDraw();
  const c = ac();
  if (s.kind === 'beat') {
    const syl = typeof s.syl === 'function' ? s.syl() : s.syl;
    const b = 60 / s.bpm, n = typeof s.syl === 'function' ? syl.length : Math.round(s.sec / b); let k = 0;
    for (let i = 0; i < n; i++) click(c.currentTime + .1 + i * b, i % 4 === 0);
    VS.tick = setInterval(() => { say(syl ? syl[k % syl.length] : String(k % 4 + 1), Math.max(0, Math.round(n * b - k * b)) + ' с'); k++; if (k >= n) voiceNextStep(); }, b * 1000 / sp);
    return;
  }
  if (s.kind === 'piano') {
    const pat = s.pat || [7, 5, 4, 2, 0], keys = warmupKeys({ pat, from: s.from, dir: s.from === 'low' ? -1 : 1, n: 6 }, base(), lastRange()), b = 60 / 100;
    let t = c.currentTime + .15; const t0 = t;
    keys.forEach(k => { VS.timers.push(setTimeout(() => say(noteShort(k + Math.min(...pat)), 'пой за пианино'), (t - t0) * 1000 / sp)); [0, 4, 7].forEach(x => tone(k + x, t, b * 1.6, .06)); t += b * 2; pat.forEach((x, j) => tone(k + x, t + j * b, (j === pat.length - 1 ? 1.8 : .95) * b, .2)); t += (pat.length + 1.5) * b; });
    VS.timer = setTimeout(voiceNextStep, (t - t0 + .3) * 1000 / sp);
    return;
  }
  let left = stepSec(s); say(left + ' с', '');
  VS.tick = setInterval(() => { left--; say(left + ' с'); if (left <= 0) voiceNextStep(); }, 1000 / sp);
}
// замер: длинный звук (голос, по высоте тона) или выдох на «с» (шум выше фона)
async function voiceMeasure(s) {
  let stream; try { stream = camRecording() && CAM.mic ? CAM.mic : await openMic(); } catch (e) { toast('Нет доступа к микрофону'); return; }
  VS.stream = stream; VS.playing = true; busy = true; VS.result = null; VS.resultText = ''; voiceDraw();
  const T = micTap(stream), t0 = performance.now() / 1000, floor = [], P = VS.P = { start: null, last: 0, sec: 0, done: false };
  const say = (a, b) => { if ($('#vsnow')) $('#vsnow').textContent = a; if ($('#vssub')) $('#vssub').textContent = b; };
  const loop = () => {
    if (!VS || !VS.stream) return;
    VS.raf = requestAnimationFrame(loop);
    const buf = T.read(), rms = T.level, now = performance.now() / 1000 - t0;
    setLevel('vslvl', rms);
    if (T.dead) { say('-', MIC_DEAD); return; }
    if (now < 1) { floor.push(rms); say('Тишина...', 'слушаю фон, не звучи'); return; }
    const fl = VA.median(floor.slice()), thr = Math.max(.006, fl * 4);
    const active = s.kind === 'mpt' ? VA.livePitch(buf, T.c.sampleRate) != null : rms > thr;
    phonStep(P, now, active);
    say(P.sec.toFixed(1) + ' с', P.start == null ? (s.kind === 'mpt' ? 'Вдох и тяни «а-а-а»' : 'Вдох и выдыхай «с-с-с»') : 'Держи ровно...');
    if (P.done || now > 120) { cancelAnimationFrame(VS.raf); voiceMeasureDone(s, P.sec); }
  };
  loop();
}
function voiceMeasureDone(s, sec) {
  voiceStop(); VS.P = null;
  if (sec < 1) { VS.result = null; VS.resultText = 'Не услышал звука. Попробуй громче и ближе к телефону.'; voiceDraw(); return; }
  const prev = recBest(s.kind);
  voiceState().rec[s.kind].push({ date: nowLocal(), sec: Math.round(sec * 10) / 10 }); save();
  VS.result = sec; VS.resultText = prev && sec > prev.sec ? `Новый рекорд! Было ${prev.sec.toFixed(1)} с` : prev ? `Лучший: ${prev.sec.toFixed(1)} с` : 'Первый замер, теперь есть с чем сравнивать';
  VS.measured = `${s.kind === 'mpt' ? 'Длинный звук' : 'Выдох на «с»'}: ${sec.toFixed(1)} с. ${VS.resultText}`;
  voiceDraw();
}

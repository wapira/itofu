/**
 * 確認画面のJSON と、バックエンドの /api/review/* のデータを行き来する変換。
 *
 *   読み取り：/api/review/recognize が返す MusicXML → 確認画面のJSON（musicXmlToConfirm）
 *     バックエンドの Score はタイをまとめ、音名を midi にしているので五線譜に描けない。
 *     そこで一緒に返ってくる MusicXML から、楽譜に書いてある通りの形を作る。
 *     対象はバックエンドの parse.py と同じ（1パート目・1つ目の声部・和音は一番上の音・装飾音は無視）。
 *
 *   確定：確認画面のJSON → バックエンドの Score（toReviewScore）
 *     タイでつながった同じ高さの音を1つにまとめ、拍の位置・長さを拍子の分母の単位にする。
 */
import { badMeasures, measureQuarters, noteQuarters } from './model.js';

const TYPE_TO_DUR = {
    whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '32',
};
/** 長さ（4分音符いくつぶんか）→ 音符の種類・付点（付点なしを先に探す） */
const QUARTERS_TO_DUR = [
    [4, 'w', 0], [2, 'h', 0], [1, 'q', 0], [0.5, '8', 0], [0.25, '16', 0], [0.125, '32', 0],
    [6, 'w', 1], [3, 'h', 1], [1.5, 'q', 1], [0.75, '8', 1], [0.375, '16', 1],
];
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const EPS = 1e-6;


// ---------- 読み取り：MusicXML → 確認画面のJSON ----------

/**
 * MusicXML の文字列から確認画面のJSONを作る。
 * meta：バックエンドが読み取った曲の情報 { title, composer, tempo }（MusicXML より優先する）
 */
export function musicXmlToConfirm(xmlText, meta = {}) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('読み取った楽譜（MusicXML）を読めませんでした');
    const part = doc.querySelector('score-partwise > part');
    if (!part) throw new Error('読み取った楽譜にパートがありません');

    const first = (sel) => part.querySelector(sel)?.textContent.trim();
    const time = {
        beats: Number(first('attributes time beats')) || 4,
        beatType: Number(first('attributes time beat-type')) || 4,
    };
    const keySharps = Number(first('attributes key fifths')) || 0;

    let divisions = 1;
    let tupletCount = 0;
    const measures = [];
    for (const measureEl of part.querySelectorAll(':scope > measure')) {
        const notes = [];
        let voice = null;           // この小節で使う声部（最初に出てきた声部）
        let group = null;           // いま続いている連符のまとまり { id, left }
        for (const el of measureEl.children) {
            if (el.tagName === 'attributes') {
                const d = Number(el.querySelector('divisions')?.textContent);
                if (d) divisions = d;
                continue;
            }
            if (el.tagName !== 'note') continue;
            if (el.querySelector(':scope > grace')) continue;
            if (el.querySelector(':scope > cue')) continue;
            const v = el.querySelector(':scope > voice')?.textContent.trim() ?? '1';
            voice ??= v;
            if (v !== voice) continue;

            // 和音：一番上の音だけ残す（前の音と高さを比べる）
            if (el.querySelector(':scope > chord')) {
                const prev = notes[notes.length - 1];
                const pitch = readPitch(el);
                if (prev && !prev.rest && pitch && midiOf(pitch) > midiOf(prev.pitch)) prev.pitch = pitch;
                continue;
            }

            const note = readDuration(el, divisions, time);
            if (el.querySelector(':scope > rest')) {
                note.rest = true;
            } else {
                const pitch = readPitch(el);
                if (!pitch) continue;
                note.pitch = pitch;
                const tied = [...el.querySelectorAll(':scope > tie, notations > tied')]
                    .some((t) => ['start', 'continue'].includes(t.getAttribute('type')));
                if (tied) note.tie = true;
            }

            // 連符：まとまりの長さが埋まるまで同じ番号
            const tm = el.querySelector(':scope > time-modification');
            if (tm) {
                const actual = Number(tm.querySelector('actual-notes')?.textContent) || 3;
                const normal = Number(tm.querySelector('normal-notes')?.textContent) || 2;
                const startMark = el.querySelector('notations > tuplet[type="start"]');
                if (!group || startMark) {
                    tupletCount += 1;
                    // まとまり全体の長さ（4分音符いくつぶんか）＝ 普通の音符 normal 個ぶん
                    const unit = noteQuarters({ dur: note.dur, dots: note.dots });
                    group = { id: tupletCount, left: unit * normal };
                }
                note.tuplet = group.id;
                note.tupletN = actual;
                group.left -= noteQuarters(note);
                const stopMark = el.querySelector('notations > tuplet[type="stop"]');
                if (stopMark || group.left <= EPS) group = null;
            } else {
                group = null;
            }
            notes.push(note);
        }
        measures.push({ notes });
    }

    // 曲の最後に続く、休符だけの小節を取り除く（バックエンドと同じ）
    while (measures.length > 1 && measures[measures.length - 1].notes.every((n) => n.rest)) {
        measures.pop();
    }

    const data = {
        title: meta.title ?? first('work work-title') ?? '',
        composer: meta.composer ?? '',
        tempo: meta.tempo ?? 80,
        time,
        keySharps,
        suspiciousMeasures: [],
        measures,
    };
    data.suspiciousMeasures = badMeasures(data);
    return data;
}

function readPitch(el) {
    const p = el.querySelector(':scope > pitch');
    if (!p) return null;
    const step = p.querySelector('step')?.textContent.trim();
    const octave = Number(p.querySelector('octave')?.textContent);
    if (!(step in STEP_SEMITONES) || !Number.isFinite(octave)) return null;
    const alter = Math.max(-1, Math.min(1, Math.round(Number(p.querySelector('alter')?.textContent) || 0)));
    return { step, alter, octave };
}

/** <type> と <dot> から長さを読む。<type> がないとき（小節全体の休符など）は <duration> から決める */
function readDuration(el, divisions, time) {
    const type = TYPE_TO_DUR[el.querySelector(':scope > type')?.textContent.trim()];
    const dots = Math.min(el.querySelectorAll(':scope > dot').length, 1);
    if (type) return { dur: type, dots };
    const isMeasureRest = el.querySelector(':scope > rest')?.getAttribute('measure') === 'yes';
    const quarters = isMeasureRest
        ? measureQuarters(time)
        : (Number(el.querySelector(':scope > duration')?.textContent) || divisions) / divisions;
    const hit = QUARTERS_TO_DUR.find(([q]) => Math.abs(q - quarters) < EPS);
    return hit ? { dur: hit[1], dots: hit[2] } : { dur: 'w', dots: 0 };
}

export function midiOf(pitch) {
    return 12 * (pitch.octave + 1) + STEP_SEMITONES[pitch.step] + pitch.alter;
}


// ---------- 確定：確認画面のJSON → バックエンドの Score ----------

/**
 * 確認画面のJSONを、/api/review/convert に送る Score にする。
 *   - 拍の位置・長さは拍子の分母の単位（4/4 なら4分音符が1、6/8 なら8分音符が1）
 *   - タイでつながった同じ高さの音は1つにまとめる（始まりの小節・位置に置き、長さを足す）
 *   - 1小節目が弱起で短いときは、先頭に休符を足して小節を埋める（バックエンドは空白を受け付けないため）
 */
export function toReviewScore(data) {
    const toBeats = data.time.beatType / 4;
    const expected = measureQuarters(data.time);
    const notes = [];
    const tupletIds = new Map();
    let pending = null;   // タイでつながっている途中の音

    data.measures.forEach((measure, m) => {
        let offset = 0;
        const total = measure.notes.reduce((sum, n) => sum + noteQuarters(n), 0);
        if (m === 0 && total < expected - EPS) {
            const pad = expected - total;
            notes.push(restNote(m, 0, pad * toBeats));
            offset = pad;
        }
        for (const n of measure.notes) {
            const length = noteQuarters(n);
            const midi = n.rest ? null : midiOf(n.pitch);
            if (pending && midi !== null && pending.midi === midi) {
                pending.beats += length * toBeats;
            } else {
                const note = n.rest
                    ? restNote(m, offset * toBeats, length * toBeats)
                    : { midi, measure: m, offset: offset * toBeats, beats: length * toBeats, rest: false, tuplet: 0, tuplet_n: 0 };
                if (n.tuplet) {
                    if (!tupletIds.has(n.tuplet)) tupletIds.set(n.tuplet, tupletIds.size + 1);
                    note.tuplet = tupletIds.get(n.tuplet);
                    note.tuplet_n = n.tupletN || 3;
                }
                notes.push(note);
                pending = note.rest ? null : note;
            }
            if (!n.tie || n.rest) pending = null;
            offset += length;
        }
    });

    // 浮動小数のずれを丸める（1/96拍単位）
    const round = (x) => Math.round(x * 96) / 96;
    notes.forEach((n) => { n.offset = round(n.offset); n.beats = round(n.beats); });

    return {
        title: data.title ?? '',
        composer: data.composer ?? '',
        tempo: Math.round(data.tempo) || 80,
        beats: data.time.beats,
        beat_type: data.time.beatType,
        notes,
        measure_count: data.measures.length,
        key_sharps: data.keySharps ?? 0,
    };
}

function restNote(measure, offset, beats) {
    return { midi: null, measure, offset, beats, rest: true, tuplet: 0, tuplet_n: 0 };
}

/**
 * 確認画面：編集用のデータと、編集の操作。
 *
 * データは README の「確認画面のJSON」の形のまま持つ。
 * ここの関数は画面に触らない。操作はどれも、元のデータを変えずに新しいデータを返す
 * （元に戻すのため）。
 *
 * 音符の場所は { m, i }（m 小節目の i 番目。どちらも0始まり）で表す。
 */

export const DURATIONS = ['w', 'h', 'q', '8', '16', '32'];

/** 音符の種類 → 4分音符いくつぶんか */
const QUARTERS = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** 休符を音符に戻すとき、前に音がなければこの高さにする（五線の真ん中） */
const DEFAULT_PITCH = { step: 'B', octave: 4 };

const EPS = 1e-6;


// ---------- 長さ・拍 ----------

/** n連符が何個ぶんの長さに入るか（3連符なら2個ぶん） */
export function tupletOccupied(n) {
    if (n === 2) return 3;
    let p = 1;
    while (p * 2 < n) p *= 2;
    return p;
}

/** 音符1つの長さ（4分音符いくつぶんか） */
export function noteQuarters(note) {
    let q = QUARTERS[note.dur];
    if (note.dots) q *= 1.5;
    if (note.tuplet && note.tupletN) q *= tupletOccupied(note.tupletN) / note.tupletN;
    return q;
}

/** 1小節の長さ（4分音符いくつぶんか） */
export function measureQuarters(time) {
    return time.beats * 4 / time.beatType;
}

/**
 * 各小節の拍が合っているか。
 * 返すもの：[{ total, expected, ok }]（total / expected は4分音符いくつぶんか）
 * 1小節目は弱起で短くてもいい（長すぎるときだけ合わないとする）。
 */
export function measureStatus(score) {
    const expected = measureQuarters(score.time);
    return score.measures.map((measure, m) => {
        const total = measure.notes.reduce((sum, n) => sum + noteQuarters(n), 0);
        const ok = m === 0
            ? total <= expected + EPS
            : Math.abs(total - expected) < EPS;
        return { total, expected, ok };
    });
}

/** 拍が合わない小節の番号（0始まり） */
export function badMeasures(score) {
    return measureStatus(score)
        .map((s, m) => (s.ok ? -1 : m))
        .filter((m) => m >= 0);
}


// ---------- 音の高さ ----------

/** 調号で付く変化（#なら1、♭なら-1、なしなら0） */
export function keyAlter(step, keySharps) {
    if (keySharps > 0 && SHARP_ORDER.slice(0, keySharps).includes(step)) return 1;
    if (keySharps < 0 && FLAT_ORDER.slice(0, -keySharps).includes(step)) return -1;
    return 0;
}

const SOLFEGE = { C: 'ド', D: 'レ', E: 'ミ', F: 'ファ', G: 'ソ', A: 'ラ', B: 'シ' };
const ALTER_MARK = { '-1': '♭', '0': '', '1': '♯' };
const DUR_NAME = { w: '全音符', h: '2分音符', q: '4分音符', '8': '8分音符', '16': '16分音符', '32': '32分音符' };
const REST_NAME = { w: '全休符', h: '2分休符', q: '4分休符', '8': '8分休符', '16': '16分休符', '32': '32分休符' };

/** 画面に出す説明（例：「ラ♭（A♭4）・付点8分音符」） */
export function describeNote(note) {
    const dots = note.dots ? '付点' : '';
    if (note.rest) return dots + REST_NAME[note.dur];
    const { step, alter, octave } = note.pitch;
    const mark = ALTER_MARK[alter] ?? '';
    const tie = note.tie ? '・タイ' : '';
    const tuplet = note.tuplet ? `・${note.tupletN}連符` : '';
    return `${SOLFEGE[step]}${mark}（${step}${mark}${octave}）・${dots}${DUR_NAME[note.dur]}${tuplet}${tie}`;
}


// ---------- 選んでいる場所 ----------

export function getNote(score, sel) {
    return sel ? score.measures[sel.m]?.notes[sel.i] ?? null : null;
}

/** 曲の最初の音符の場所。音符がなければ null */
export function firstSel(score) {
    const m = score.measures.findIndex((x) => x.notes.length > 0);
    return m < 0 ? null : { m, i: 0 };
}

/** 隣の音符の場所（step は +1 / -1）。端なら今の場所のまま */
export function moveSel(score, sel, step) {
    if (!sel) return firstSel(score);
    let { m, i } = sel;
    i += step;
    while (m >= 0 && m < score.measures.length) {
        const len = score.measures[m].notes.length;
        if (i >= 0 && i < len) return { m, i };
        m += step;
        if (m < 0 || m >= score.measures.length) break;
        i = step > 0 ? 0 : score.measures[m].notes.length - 1;
    }
    return sel;
}

/** 消したあとなどで、場所が範囲の外に出ないようにする */
export function clampSel(score, sel) {
    if (!sel) return firstSel(score);
    const notes = score.measures[sel.m]?.notes;
    if (!notes) return firstSel(score);
    if (notes.length === 0) return moveSel(score, { m: sel.m, i: -1 }, 1);
    return { m: sel.m, i: Math.min(sel.i, notes.length - 1) };
}


// ---------- 編集の操作 ----------

/** sel の音符を fn で書き換えた新しいデータを返す（fn は複製した音符を直接書き換えてよい） */
function updateNote(score, sel, fn) {
    if (!getNote(score, sel)) return score;
    const next = structuredClone(score);
    fn(next.measures[sel.m].notes[sel.i], next, sel);
    return next;
}

/** 選んでいる音より前で、一番近い音符の高さ（休符を音符に戻すときに使う） */
function previousPitch(score, sel) {
    for (let m = sel.m; m >= 0; m--) {
        const notes = score.measures[m].notes;
        const start = m === sel.m ? sel.i - 1 : notes.length - 1;
        for (let i = start; i >= 0; i--) {
            if (!notes[i].rest) return notes[i].pitch;
        }
    }
    return null;
}

/** 高さを1音（ドレミの1つ）上げる・下げる。♯♭は調号に合わせ直す */
export function stepPitch(score, sel, dir) {
    return updateNote(score, sel, (note, next) => {
        if (note.rest) return;
        let index = STEPS.indexOf(note.pitch.step) + dir;
        let octave = note.pitch.octave;
        if (index >= STEPS.length) { index = 0; octave += 1; }
        if (index < 0) { index = STEPS.length - 1; octave -= 1; }
        const step = STEPS[index];
        note.pitch = { step, alter: keyAlter(step, next.keySharps), octave };
    });
}

/** ♯（1）・♭（-1）・♮（0）にする */
export function setAlter(score, sel, alter) {
    return updateNote(score, sel, (note) => {
        if (!note.rest) note.pitch.alter = alter;
    });
}

/** 音符の種類を変える */
export function setDuration(score, sel, dur) {
    return updateNote(score, sel, (note) => {
        note.dur = dur;
        if (dur === '32') note.dots = 0;  // 付点32分は使わない
    });
}

/** 付点を付ける・外す */
export function toggleDot(score, sel) {
    return updateNote(score, sel, (note) => {
        note.dots = note.dots ? 0 : (note.dur === '32' ? 0 : 1);
    });
}

/** 休符にする・音符に戻す */
export function toggleRest(score, sel) {
    return updateNote(score, sel, (note, next) => {
        if (note.rest) {
            const prev = previousPitch(next, sel);
            const pitch = prev
                ? { ...prev }
                : { ...DEFAULT_PITCH, alter: keyAlter(DEFAULT_PITCH.step, next.keySharps) };
            delete note.rest;
            note.pitch = pitch;
        } else {
            delete note.pitch;
            delete note.tie;
            note.rest = true;
        }
    });
}

/** タイ（次の音とつなぐ）を付ける・外す */
export function toggleTie(score, sel) {
    return updateNote(score, sel, (note) => {
        if (note.rest) return;
        if (note.tie) delete note.tie;
        else note.tie = true;
    });
}

/**
 * 消す。音符は同じ長さの休符になる（小節の長さが崩れない）。休符はその場から取り除く。
 * 返すもの：{ score, sel }
 */
export function deleteNote(score, sel) {
    const note = getNote(score, sel);
    if (!note) return { score, sel };
    if (!note.rest) return { score: toggleRest(score, sel), sel };
    const next = structuredClone(score);
    next.measures[sel.m].notes.splice(sel.i, 1);
    return { score: next, sel: clampSel(next, sel) };
}

/**
 * 選んでいる音のうしろに、同じ高さ・同じ長さの音を足す（連符とタイは引き継がない）。
 * 返すもの：{ score, sel }（sel は足した音）
 */
export function insertAfter(score, sel) {
    const note = getNote(score, sel);
    if (!note) return { score, sel };
    const next = structuredClone(score);
    const copy = structuredClone(note);
    delete copy.tie;
    delete copy.tuplet;
    delete copy.tupletN;
    next.measures[sel.m].notes.splice(sel.i + 1, 0, copy);
    return { score: next, sel: { m: sel.m, i: sel.i + 1 } };
}


// ---------- 元に戻す ----------

/** 元に戻す・やり直すための履歴。データと選んでいる場所をまとめて積む */
export class History {
    constructor(limit = 200) {
        this.undoStack = [];
        this.redoStack = [];
        this.limit = limit;
    }

    /** 編集する直前の状態を積む */
    push(state) {
        this.undoStack.push(state);
        if (this.undoStack.length > this.limit) this.undoStack.shift();
        this.redoStack = [];
    }

    undo(current) {
        if (!this.undoStack.length) return null;
        this.redoStack.push(current);
        return this.undoStack.pop();
    }

    redo(current) {
        if (!this.redoStack.length) return null;
        this.undoStack.push(current);
        return this.redoStack.pop();
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }
}

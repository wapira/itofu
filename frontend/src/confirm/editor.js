/**
 * 確認画面：原本・五線譜・ツールバー・キー操作をまとめて動かす。
 *
 * main.js からは createConfirmScreen() で作り、open(原本のファイル, 確認画面のJSON) で開く。
 * 「これで糸譜を作る」が押されたら onSubmit(直したJSON) を呼ぶ。
 * 曲名・作曲者・テンポは五線譜の編集（元に戻すの対象）とは別に、入力欄から読んで送るときに入れる。
 */
import {
    History, addMeasureAfter, badMeasures, clampSel, deleteMeasure, deleteNote, describeNote,
    firstSel, getNote, insertAfter, isEmptyMeasureSel, moveSel, setAlter, setDuration, stepPitch,
    toggleDot, toggleRest, toggleTie,
} from './model.js';
import { renderNotation, waitForFonts } from './notation.js';
import { createOriginalView } from './original.js';

/** 数字キー → 音符の種類（MuseScore と同じ並び） */
const KEY_DURATIONS = { '2': '32', '3': '16', '4': '8', '5': 'q', '6': 'h', '7': 'w' };

export function createConfirmScreen({ root, onSubmit }) {
    const $ = (sel) => root.querySelector(sel);
    const notationEl = $('#confirm-notation');
    const notationScroll = $('#confirm-notation-scroll');
    const originalView = createOriginalView($('#confirm-original'));
    const summaryEl = $('#confirm-summary');
    const selectionEl = $('#confirm-selection');
    const errorEl = $('#confirm-error');
    const warningsEl = $('#confirm-warnings');
    const submitBtn = $('#btn-confirm-submit');
    const metaInputs = {
        title: $('#meta-title'),
        composer: $('#meta-composer'),
        tempo: $('#meta-tempo'),
    };

    let score = null;
    let sel = null;
    let history = new History();
    let layout = null;
    let busy = false;

    // ---------- 描く ----------

    function render({ scrollToSelection = false } = {}) {
        if (!score) return;
        layout = renderNotation(notationEl, score, sel);
        updateSummary();
        updateSelectionInfo();
        updateButtons();
        if (scrollToSelection && layout.selectedBox) scrollIntoView(layout.selectedBox);
    }

    function updateSummary() {
        const bad = badMeasures(score);
        const count = score.measures.length;
        summaryEl.classList.toggle('has-bad', bad.length > 0);
        const empty = score.measures.map((x, m) => (x.notes.length ? -1 : m)).filter((m) => m >= 0);
        const emptyText = empty.length
            ? `${empty.map((m) => m + 1).join('・')}小節目は音を読み取れませんでした（全音符を見落とすことがあります）。`
            : '';
        summaryEl.textContent = bad.length
            ? `${count}小節を読み取りました。赤い小節（${bad.map((m) => m + 1).join('・')}小節目）は拍が合いません。${emptyText}原本と見比べて直してください。`
            : `${count}小節を読み取りました。原本と見比べて、違うところや足りない小節があれば直してください。`;
    }

    function updateSelectionInfo() {
        const note = getNote(score, sel);
        if (note) selectionEl.textContent = `${sel.m + 1}小節目・${sel.i + 1}つ目：${describeNote(note)}`;
        else if (isEmptyMeasureSel(score, sel)) selectionEl.textContent = `${sel.m + 1}小節目（音がありません）：「＋ 足す」で音を入れられます`;
        else selectionEl.textContent = '音符をクリックして選んでください';
    }

    function updateButtons() {
        const note = getNote(score, sel);
        const emptyMeasure = isEmptyMeasureSel(score, sel);
        root.querySelectorAll('[data-op]').forEach((btn) => {
            const op = btn.dataset.op;
            let disabled = !note;
            if (op === 'undo') disabled = !history.canUndo;
            if (op === 'redo') disabled = !history.canRedo;
            if (op === 'insert') disabled = !note && !emptyMeasure;
            if (op === 'addMeasure') disabled = !sel;
            if (op === 'deleteMeasure') disabled = !sel || score.measures.length <= 1;
            if (note?.rest && ['up', 'down', 'sharp', 'flat', 'natural', 'tie'].includes(op)) disabled = true;
            btn.disabled = disabled;
            // 今の音に当てはまるボタンを押した見た目にする
            let pressed = false;
            if (note) {
                if (btn.dataset.dur) pressed = note.dur === btn.dataset.dur;
                if (op === 'dot') pressed = !!note.dots;
                if (op === 'rest') pressed = !!note.rest;
                if (op === 'tie') pressed = !!note.tie;
                if (op === 'sharp') pressed = note.pitch?.alter === 1;
                if (op === 'flat') pressed = note.pitch?.alter === -1;
            }
            btn.classList.toggle('pressed', pressed);
        });
    }

    function scrollIntoView(box) {
        const top = box.y - 30;
        const bottom = box.y + box.h + 30;
        if (top < notationScroll.scrollTop) notationScroll.scrollTop = top;
        else if (bottom > notationScroll.scrollTop + notationScroll.clientHeight) {
            notationScroll.scrollTop = bottom - notationScroll.clientHeight;
        }
    }

    // ---------- 編集 ----------

    /** 編集を1つ行う。fn は { score, sel } を返す */
    function edit(fn) {
        if (!sel) return;
        const result = fn(score, sel);
        if (result.score === score) return;
        history.push({ score, sel });
        score = result.score;
        sel = clampSel(score, result.sel ?? sel);
        render({ scrollToSelection: true });
    }

    const keep = (f) => (s, p) => ({ score: f(s, p) });

    const OPS = {
        up: keep((s, p) => stepPitch(s, p, 1)),
        down: keep((s, p) => stepPitch(s, p, -1)),
        sharp: keep((s, p) => setAlter(s, p, getNote(s, p).pitch?.alter === 1 ? 0 : 1)),
        flat: keep((s, p) => setAlter(s, p, getNote(s, p).pitch?.alter === -1 ? 0 : -1)),
        natural: keep((s, p) => setAlter(s, p, 0)),
        dot: keep(toggleDot),
        rest: keep(toggleRest),
        tie: keep(toggleTie),
        insert: insertAfter,
        delete: deleteNote,
        addMeasure: addMeasureAfter,
        deleteMeasure,
    };

    function runOp(op, btn) {
        if (op === 'undo') return undo();
        if (op === 'redo') return redo();
        if (op === 'dur') return edit(keep((s, p) => setDuration(s, p, btn.dataset.dur)));
        if (OPS[op]) edit(OPS[op]);
    }

    function undo() {
        const prev = history.undo({ score, sel });
        if (!prev) return;
        ({ score, sel } = prev);
        render({ scrollToSelection: true });
    }

    function redo() {
        const next = history.redo({ score, sel });
        if (!next) return;
        ({ score, sel } = next);
        render({ scrollToSelection: true });
    }

    function select(next) {
        sel = next;
        render({ scrollToSelection: true });
    }

    // ---------- イベント ----------

    root.querySelectorAll('[data-op]').forEach((btn) => {
        btn.addEventListener('click', () => runOp(btn.dataset.op, btn));
    });
    $('#btn-zoom-in').addEventListener('click', () => originalView.zoomIn());
    $('#btn-zoom-out').addEventListener('click', () => originalView.zoomOut());

    notationEl.addEventListener('click', (e) => {
        if (!layout) return;
        const rect = notationEl.getBoundingClientRect();
        const hit = layout.hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) select(hit);
    });

    document.addEventListener('keydown', (e) => {
        if (root.hidden || !score || busy) return;
        if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
        const ctrl = e.ctrlKey || e.metaKey;
        let handled = true;
        if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) undo();
        else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) redo();
        else if (ctrl || e.altKey) handled = false;
        else if (e.key === 'ArrowRight') select(moveSel(score, sel, 1));
        else if (e.key === 'ArrowLeft') select(moveSel(score, sel, -1));
        else if (e.key === 'ArrowUp') edit(OPS.up);
        else if (e.key === 'ArrowDown') edit(OPS.down);
        else if (KEY_DURATIONS[e.key]) edit(keep((s, p) => setDuration(s, p, KEY_DURATIONS[e.key])));
        else if (e.key === '.') edit(OPS.dot);
        else if (e.key === '0') edit(OPS.rest);
        else if (e.key.toLowerCase() === 't') edit(OPS.tie);
        else if (e.key === 'Delete' || e.key === 'Backspace') edit(OPS.delete);
        else handled = false;
        if (handled) e.preventDefault();
    });

    // 幅が変わったら描き直す（1段の小節数・音符の間隔が変わるため）
    let resizeTimer = 0;
    let lastWidth = 0;
    new ResizeObserver(() => {
        const w = notationEl.clientWidth;
        if (!score || w === lastWidth) return;
        lastWidth = w;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => render(), 120);
    }).observe(notationEl);

    submitBtn.addEventListener('click', async () => {
        const tempo = Number(metaInputs.tempo.value);
        if (!Number.isInteger(tempo) || tempo < 1 || tempo > 400) {
            errorEl.textContent = 'テンポは1〜400の整数で入れてください。';
            errorEl.hidden = false;
            metaInputs.tempo.focus();
            return;
        }
        const bad = badMeasures(score);
        if (bad.length && !window.confirm(
            `${bad.map((m) => m + 1).join('・')}小節目は拍が合っていません。このまま糸譜を作りますか？`)) return;
        errorEl.hidden = true;
        busy = true;
        submitBtn.disabled = true;
        const label = submitBtn.textContent;
        submitBtn.textContent = '糸譜を作っています…';
        try {
            const { suspiciousMeasures, ...data } = score;
            await onSubmit({
                ...data,
                title: metaInputs.title.value.trim(),
                composer: metaInputs.composer.value.trim(),
                tempo,
            });
        } catch (err) {
            errorEl.textContent = err.message || '糸譜を作れませんでした。';
            errorEl.hidden = false;
        } finally {
            busy = false;
            submitBtn.disabled = false;
            submitBtn.textContent = label;
        }
    });

    // ---------- 曲の情報 ----------

    function showMeta(data, missingFields) {
        metaInputs.title.value = data.title ?? '';
        metaInputs.composer.value = data.composer ?? '';
        metaInputs.tempo.value = data.tempo ?? 80;
        root.querySelectorAll('.meta-field').forEach((label) => {
            const missing = missingFields.includes(label.dataset.field);
            label.classList.toggle('missing', missing);
            label.title = missing ? '読み取れませんでした。原本を見て入れてください' : '';
        });
    }
    Object.values(metaInputs).forEach((input) => {
        // 入れ直したら「読み取れなかった」の印を外す
        input.addEventListener('input', () => input.closest('.meta-field').classList.remove('missing'));
    });

    // ---------- 開く ----------

    return {
        /**
         * 原本のファイルと確認画面のJSONで開く。画面を表示してから呼ぶ（幅を測るため）。
         * warnings：読み取りの注意（そのまま並べて出す）、missingFields：読み取れなかった曲の情報（title / composer / tempo）
         */
        async open(file, data, { warnings = [], missingFields = [] } = {}) {
            score = structuredClone(data);
            showMeta(data, missingFields);
            warningsEl.replaceChildren(...warnings.map((w) => {
                const li = document.createElement('li');
                li.textContent = w;
                return li;
            }));
            warningsEl.hidden = warnings.length === 0;
            history = new History();
            sel = firstSel(score);
            errorEl.hidden = true;
            notationScroll.scrollTop = 0;
            const original = originalView.show(file).catch(() => {
                $('#confirm-original').textContent = '原本を表示できませんでした。';
            });
            await waitForFonts();
            lastWidth = notationEl.clientWidth;
            render();
            await original;
        },
    };
}

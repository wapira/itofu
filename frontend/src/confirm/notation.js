/**
 * 確認画面：読み取った楽譜を VexFlow で五線譜に描く。
 *
 * 編集するたびに全部描き直す。描いたあと、各音符の場所（当たり判定の四角）を覚えておき、
 * クリックされた場所から「何小節目の何番目の音符か」を返す。
 */
import {
    Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveNote, StaveTie, Tuplet, Voice,
} from 'vexflow/bravura';

import { keyAlter, measureStatus, tupletOccupied } from './model.js';

const LINE_HEIGHT = 130;        // 1段の高さ
const TOP_PADDING = 30;         // 1段目の上の余白（高い音・小節番号のぶん）
const SIDE_PADDING = 10;
const NARROW_WIDTH = 640;       // これより狭いときは1段2小節にする

const COLOR_SELECTED = '#b83227';
const COLOR_BAD_FILL = 'rgba(184, 50, 39, 0.10)';
const COLOR_BAD_STROKE = '#b83227';
const COLOR_SELECTED_MEASURE = 'rgba(31, 54, 77, 0.10)';

/** 調号の#の数 → VexFlow の調号名 */
const MAJOR_KEYS = {
    '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
    '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
};
const ACCIDENTAL_SYMBOL = { '-1': 'b', '0': 'n', '1': '#' };

let fontsReady = null;

/** VexFlow の楽譜フォント（Bravura）が読み込まれるのを待つ */
export function waitForFonts() {
    fontsReady ??= document.fonts.load('30px Bravura').catch(() => {});
    return fontsReady;
}

/**
 * 五線譜を描く。
 * container：描く場所（中身は消して描き直す）
 * score：確認画面のJSON
 * sel：選んでいる音符 { m, i }（なければ null）
 * 返すもの：{ hitTest(x, y) → sel | null, selectedBox }（x, y は container の中の座標）
 */
export function renderNotation(container, score, sel) {
    // VexFlow は描く先の要素に幅を書き込むので、中に描く用の要素を作る（container は幅を測るだけにする）
    container.innerHTML = '';
    const width = Math.max(container.clientWidth, 320);
    const target = document.createElement('div');
    container.appendChild(target);
    const perLine = width < NARROW_WIDTH ? 2 : 4;
    const lineCount = Math.max(1, Math.ceil(score.measures.length / perLine));
    const height = TOP_PADDING + lineCount * LINE_HEIGHT;

    const renderer = new Renderer(target, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const status = measureStatus(score);
    const timeSig = `${score.time.beats}/${score.time.beatType}`;
    const keyName = MAJOR_KEYS[String(score.keySharps)] ?? 'C';
    const beamGroups = Beam.getDefaultBeamGroups(timeSig);
    const layoutX = measureLayout(score, perLine, width - SIDE_PADDING * 2, keyName, timeSig);

    const hits = [];          // { m, i, x, y, w, h }
    const emptyBoxes = [];    // 音が1つもない小節 { m, x, y, w, h }（クリックで選べるように）
    const drawn = [];         // 曲の頭から順に { m, i, note, staveNote, line }
    let selectedBox = null;

    score.measures.forEach((measure, m) => {
        const line = Math.floor(m / perLine);
        const col = m % perLine;
        const x = SIDE_PADDING + layoutX[m].x;
        const staveWidth = layoutX[m].width;
        const y = TOP_PADDING + line * LINE_HEIGHT;

        const stave = new Stave(x, y, staveWidth);
        if (col === 0) stave.addClef('treble').addKeySignature(keyName);
        if (m === 0) stave.addTimeSignature(timeSig);
        stave.setMeasure(m + 1);
        stave.setContext(ctx);

        // 拍が合わない小節は、うしろに赤い四角を敷く
        if (!status[m].ok) {
            const top = stave.getYForLine(0) - 14;
            const bottom = stave.getYForLine(4) + 14;
            ctx.save();
            ctx.setFillStyle(COLOR_BAD_FILL);
            ctx.fillRect(x, top, staveWidth, bottom - top);
            ctx.rect(x, top, staveWidth, bottom - top,
                { fill: 'none', stroke: COLOR_BAD_STROKE, 'stroke-width': 1.5 });
            ctx.restore();
        }
        stave.draw();

        if (!measure.notes.length) {
            const top = stave.getYForLine(0) - 14;
            const box = { m, i: -1, x, y: top, w: staveWidth, h: stave.getYForLine(4) + 14 - top };
            emptyBoxes.push(box);
            if (sel && sel.m === m && sel.i === -1) {
                ctx.save();
                ctx.setFillStyle(COLOR_SELECTED_MEASURE);
                ctx.fillRect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
                ctx.restore();
                selectedBox = box;
            }
            return;
        }

        const staveNotes = measure.notes.map((note, i) => {
            const isSelected = sel && sel.m === m && sel.i === i;
            const staveNote = buildStaveNote(note, isSelected);
            drawn.push({ m, i, note, staveNote, line });
            return staveNote;
        });
        addAccidentals(measure.notes, staveNotes, score.keySharps);
        const tuplets = buildTuplets(measure.notes, staveNotes);

        const voice = new Voice({ numBeats: score.time.beats, beatValue: score.time.beatType })
            .setMode(Voice.Mode.SOFT)
            .addTickables(staveNotes);
        const beams = Beam.generateBeams(
            staveNotes.filter((n, i) => !measure.notes[i].tuplet),
            { groups: beamGroups },
        );
        const tupletBeams = tuplets.flatMap(({ notes }) =>
            notes.every((n) => !n.isRest()) && notes.length > 1 && canBeam(notes)
                ? [new Beam(notes)] : []);

        const noteWidth = Math.max(stave.getNoteEndX() - stave.getNoteStartX() - 12, 40);
        new Formatter().joinVoices([voice]).format([voice], noteWidth);
        voice.draw(ctx, stave);
        [...beams, ...tupletBeams].forEach((b) => b.setContext(ctx).draw());
        tuplets.forEach(({ tuplet }) => tuplet.setContext(ctx).draw());

        staveNotes.forEach((staveNote, i) => {
            const box = staveNote.getBoundingBox();
            const hit = { m, i, x: box.getX(), y: box.getY(), w: box.getW(), h: box.getH() };
            hits.push(hit);
            if (sel && sel.m === m && sel.i === i) selectedBox = hit;
        });
    });

    drawTies(ctx, drawn);

    return {
        selectedBox,
        hitTest(px, py) {
            const line = Math.floor((py - TOP_PADDING + LINE_HEIGHT * 0.15) / LINE_HEIGHT);
            let best = null;
            let bestDist = Infinity;
            for (const h of hits) {
                const hLine = Math.floor((h.y + h.h / 2 - TOP_PADDING) / LINE_HEIGHT);
                if (hLine !== line) continue;
                const dx = px < h.x ? h.x - px : px > h.x + h.w ? px - (h.x + h.w) : 0;
                if (dx > 18) continue;
                const cy = h.y + h.h / 2;
                const dist = dx * 4 + Math.abs(py - cy) * 0.2;
                if (dist < bestDist) { bestDist = dist; best = { m: h.m, i: h.i }; }
            }
            if (best) return best;
            // 音符に当たらなければ、空の小節をクリックしたか
            const empty = emptyBoxes.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y - 10 && py <= b.y + b.h + 10);
            return empty ? { m: empty.m, i: -1 } : null;
        },
    };
}

/**
 * 各小節の横の位置と幅を決める。
 * 段の最初の小節は音部記号・調号（1小節目は拍子も）のぶん広くし、
 * 残りは音符の数に合わせて分ける（16分音符が並ぶ小節が詰まりすぎないように）。
 * 返すもの：[{ x, width }]（x は左の余白を除いた位置）
 */
function measureLayout(score, perLine, lineWidth, keyName, timeSig) {
    const headWidth = (withTime) => {
        const plain = new Stave(0, 0, 400);
        const head = new Stave(0, 0, 400).addClef('treble').addKeySignature(keyName);
        if (withTime) head.addTimeSignature(timeSig);
        return head.getNoteStartX() - plain.getNoteStartX();
    };
    const result = [];
    for (let start = 0; start < score.measures.length; start += perLine) {
        const head = headWidth(start === 0);
        // 最後の段も、ほかの段と同じ小節の幅になるように perLine 個ぶんで割る
        const weights = Array.from({ length: perLine }, (_, k) => {
            const notes = score.measures[start + k]?.notes.length ?? 4;
            return Math.pow(Math.max(notes, 3), 0.6);
        });
        const total = weights.reduce((a, b) => a + b, 0);
        const free = lineWidth - head;
        let x = 0;
        for (let k = 0; k < perLine && start + k < score.measures.length; k++) {
            const width = free * weights[k] / total + (k === 0 ? head : 0);
            result.push({ x, width });
            x += width;
        }
    }
    return result;
}

/** 音符1つ → VexFlow の StaveNote */
function buildStaveNote(note, selected) {
    const staveNote = note.rest
        ? new StaveNote({ keys: ['b/4'], duration: note.dur + 'r', dots: note.dots || 0 })
        : new StaveNote({
            keys: [`${note.pitch.step.toLowerCase()}/${note.pitch.octave}`],
            duration: note.dur,
            dots: note.dots || 0,
            autoStem: true,
        });
    if (note.dots) Dot.buildAndAttach([staveNote], { all: true });
    if (selected) {
        staveNote.setStyle({ fillStyle: COLOR_SELECTED, strokeStyle: COLOR_SELECTED });
    }
    return staveNote;
}

/**
 * 臨時記号を付ける。調号と、同じ小節で前に付いた臨時記号から、
 * 書かなくても分かる音には付けない。
 */
function addAccidentals(notes, staveNotes, keySharps) {
    const current = new Map();  // "B4" → いま効いている変化
    notes.forEach((note, i) => {
        if (note.rest) return;
        const { step, alter, octave } = note.pitch;
        const id = step + octave;
        const now = current.has(id) ? current.get(id) : keyAlter(step, keySharps);
        const prevTied = i > 0 && notes[i - 1].tie && !notes[i - 1].rest
            && notes[i - 1].pitch.step === step && notes[i - 1].pitch.octave === octave;
        if (alter !== now && !prevTied) {
            const symbol = ACCIDENTAL_SYMBOL[String(alter)];
            if (symbol) staveNotes[i].addModifier(new Accidental(symbol), 0);
        }
        current.set(id, alter);
    });
}

/** 同じ連符のまとまりの音を集めて Tuplet を作る（小節をまたぐまとまりは、小節ごとに分ける） */
function buildTuplets(notes, staveNotes) {
    const groups = [];
    notes.forEach((note, i) => {
        if (!note.tuplet) return;
        const last = groups[groups.length - 1];
        if (last && last.id === note.tuplet && last.end === i - 1) {
            last.notes.push(staveNotes[i]);
            last.end = i;
        } else {
            groups.push({ id: note.tuplet, n: note.tupletN || 3, notes: [staveNotes[i]], end: i });
        }
    });
    return groups.map((g) => ({
        notes: g.notes,
        tuplet: new Tuplet(g.notes, {
            numNotes: g.n,
            notesOccupied: tupletOccupied(g.n),
            bracketed: g.notes.some((n) => n.isRest()) || !canBeam(g.notes),
        }),
    }));
}

/** 連桁でつなげる長さ（8分より短い）か */
function canBeam(staveNotes) {
    return staveNotes.every((n) => ['8', '16', '32'].includes(n.getDuration()));
}

/** タイを描く。段をまたぐときは、段の終わりと次の段の始まりに分けて描く */
function drawTies(ctx, drawn) {
    drawn.forEach((cur, k) => {
        if (!cur.note.tie || cur.note.rest) return;
        const next = drawn[k + 1];
        if (!next || next.note.rest) return;
        const ties = cur.line === next.line
            ? [{ firstNote: cur.staveNote, lastNote: next.staveNote }]
            : [{ firstNote: cur.staveNote }, { lastNote: next.staveNote }];
        ties.forEach((t) => {
            new StaveTie({ ...t, firstIndexes: [0], lastIndexes: [0] }).setContext(ctx).draw();
        });
    });
}

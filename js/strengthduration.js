/* ------------------------------------------------------------------
 * strengthduration.js -- 강도–지속시간 곡선 (매뉴얼 III-1 2)
 *
 * 자극기간을 바꿔 가며 역치전류를 이분법으로 찾고, I = Ir(1 + C/t) 로
 * 맞춰 rheobase current(Ir) 와 chronaxie(C) 를 구한다.  곡선 위에
 * Ir 은 수평 점근선으로, C 는 2·Ir 과 만나는 지점으로 직접 그려서
 * 두 정의가 그림에서 바로 읽히게 한다.
 *
 * 계산은 heart10Doc.cpp 포팅본(HeartModel)을 그대로 쓰며, 화면에
 * 그리지 않고 한 에피소드씩 돌린다.
 * ------------------------------------------------------------------ */
(function (global) {
'use strict';

/* 한 번의 자극에 대해 막전위 최대값을 구한다 (화면 출력 없음).
   cfg 는 app.js 가 넘겨 주는 현재 세포·실험조건. */
function simulateOnce(cfg, P) {
    var M = new global.HeartModel(), k;

    for (k = 0; k < 25; k++) M.SF[k] = cfg.SF[k];
    for (k = 0; k < 10; k++) M.Ion[k] = cfg.Ion[k];
    for (k = 0; k < 4; k++) M.Condition[k] = cfg.Condition[k];
    for (k = 0; k < 19; k++) M.Pulse[k] = P[k];

    M.cellNo = 1;
    M.m_AP = 0;                       // strength-duration 은 전류고정 실험
    M.bHH = cfg.bHH;
    M.bConstantField = cfg.bConstantField;
    M.stimSign = cfg.stimSign;
    M.m_FixedTimeInterval = cfg.m_FixedTimeInterval;
    M.TotalTime = P[18] * P[17];

    /* CHeart10View::OnPlay 와 같은 순서 */
    M.InputAll();
    M.DefInitialVarInput();
    M.DefIonVar();
    M.DefScaleVar();
    M.INITIALSETTING();
    M.DefInitialVarPreset();
    M.calculatevm();                  // 매번 안정 상태에서 출발
    M.NewCell = false;

    var SS = M.TotalTime + P[16];
    var vmax = -1e9, guard = 0;
    do {
        M.SetTimeInterval();
        M.CalSteps();
        if (M.Vm[1] > vmax) vmax = M.Vm[1];
        guard++;
    } while (M.CurrentTime <= SS && Math.abs(M.Vm[1]) <= 400 && guard < 400000);

    return { vmax: vmax, dead: Math.abs(M.Vm[1]) > 400, rest: M.Erev };
}

/* 주어진 자극기간에서 활동전압을 일으키는 최소 전류 (이분법) */
function thresholdFor(cfg, baseP, durMs, level, cap) {
    var dir = cfg.stimSign < 0 ? 1 : -1;      // 탈분극이 되는 쪽 부호
    var P = baseP.slice();
    P[7] = durMs;                              // 펄스 2 지속시간
    P[13] = 0; P[14] = 0;                      // 증분 없음
    P[15] = 1; P[17] = 1;                      // 한 에피소드 · 한 자극
    var span = P[1] + P[4] + P[7] + P[10] + P[12];
    P[18] = Math.max(P[18], span);
    P[16] = 0;

    function fires(a) {
        P[5] = dir * a; P[6] = dir * a;
        return simulateOnce(cfg, P).vmax >= level;
    }

    /* 발화하는 상한을 먼저 찾는다 */
    var hi = 0.05, n = 0;
    while (!fires(hi)) {
        hi *= 2; n++;
        if (hi > cap || n > 40) return null;    // 이 기간에는 아무리 세게 줘도 안 남
    }
    var lo = 0;
    for (n = 0; n < 18; n++) {                  // 0.001 % 수준까지 좁힌다
        var mid = (lo + hi) / 2;
        if (fires(mid)) hi = mid; else lo = mid;
    }
    return { dur: durMs, i: hi, totalTime: P[18] * P[17] };
}

/* 한 에피소드를 돌려 IKdr 시간경과를 기록한다 (전압고정 분석용).
   dt 를 고정해 56 % 도달시간을 충분한 분해능으로 읽는다. */
function recordEpisode(cfg, P, vcMode, dt) {
    var M = new global.HeartModel(), k;

    for (k = 0; k < 25; k++) M.SF[k] = cfg.SF[k];
    for (k = 0; k < 10; k++) M.Ion[k] = cfg.Ion[k];
    for (k = 0; k < 4; k++) M.Condition[k] = cfg.Condition[k];
    for (k = 0; k < 19; k++) M.Pulse[k] = P[k];

    M.cellNo = 1;
    M.m_AP = vcMode ? 1 : 0;
    M.bHH = cfg.bHH;
    M.bConstantField = cfg.bConstantField;
    M.stimSign = cfg.stimSign;
    M.m_FixedTimeInterval = dt || 0;
    M.TotalTime = P[18] * P[17];

    M.InputAll();
    M.DefInitialVarInput();
    M.DefIonVar();
    M.DefScaleVar();
    M.INITIALSETTING();
    M.DefInitialVarPreset();
    M.calculatevm();
    M.NewCell = false;

    var SS = M.TotalTime + P[16];
    var t = [], ik = [], nn = [], vm = [], guard = 0;
    do {
        M.SetTimeInterval();
        M.CalSteps();
        t.push(M.CurrentTime);
        ik.push(M.ii[14][4][1]);        // IKdr (HH)
        nn.push(M.m[14][6][1]);         // n gate
        vm.push(M.Vm[1]);
        guard++;
    } while (M.CurrentTime <= SS && Math.abs(M.Vm[1]) <= 400 && guard < 400000);

    return { t: t, ik: ik, n: nn, vm: vm, VK: M.VK[1] };
}

/* 한 지령전위에서 IK 활성화 시간상수를 잰다.
   - 펄스 2 시작점부터 시간을 재고 (매뉴얼: holding length 는 빼야 함)
   - 정상상태에 이르지 못하면 펄스 2 를 자동으로 늘린다 (매뉴얼의 -60 mV 주의사항)
   - n^4 가 full 값의 56 % 에 닿는 시각 = 2 tau 이므로 tau = t56 / 2        */
function tauForStep(cfg, baseP, vCmd, opts) {
    var dt = (opts && opts.dt) || 0.02;
    var capMs = (opts && opts.capMs) || 600;
    var P = baseP.slice();
    P[5] = vCmd; P[6] = vCmd;
    P[13] = 0; P[14] = 0; P[15] = 1; P[17] = 1; P[16] = 0;

    var dur = Math.max(baseP[7], 1), rec = null, t0, t1, iFull, ok = false, grew = false;

    while (true) {
        P[7] = dur;
        var span = P[1] + P[4] + P[7] + P[10] + P[12];
        P[18] = Math.max(baseP[18], span);
        rec = recordEpisode(cfg, P, true, dt);

        t0 = P[1] + P[4];
        t1 = t0 + P[7];

        var iAtEnd = null, iEarlier = null, j;
        for (j = 0; j < rec.t.length; j++) {
            if (rec.t[j] <= t1) iAtEnd = rec.ik[j];
            if (rec.t[j] <= t1 - 0.25 * P[7]) iEarlier = rec.ik[j];
        }
        if (iAtEnd === null) return null;
        iFull = iAtEnd;

        /* 마지막 25 % 구간에서 0.5 % 미만으로 변하면 정상상태로 본다 */
        ok = (iEarlier !== null) && Math.abs(iFull) > 1e-9 &&
             Math.abs(iFull - iEarlier) / Math.abs(iFull) < 0.005;
        if (ok || dur >= capMs) break;
        dur *= 2; grew = true;
    }

    if (!(Math.abs(iFull) > 1e-9)) return null;

    /* 56 % 도달 시각 (선형보간) */
    var target = 0.56 * iFull, t56 = null, p;
    for (p = 1; p < rec.t.length; p++) {
        if (rec.t[p] < t0) continue;
        if (rec.t[p] > t1) break;
        var a = rec.ik[p - 1], b = rec.ik[p];
        if ((a < target && b >= target) || (a > target && b <= target)) {
            var f = (target - a) / ((b - a) || 1e-30);
            t56 = rec.t[p - 1] + f * (rec.t[p] - rec.t[p - 1]);
            break;
        }
    }
    if (t56 === null) return null;

    return { V: vCmd, t56: t56 - t0, tau: (t56 - t0) / 2,
             Iss: iFull, dur: P[7], steady: ok, grew: grew, VK: rec.VK };
}

/* 주어진 전류에서 활동전압을 일으키는 최소 자극기간 (이분법).
   chronaxie 의 정의 그대로 I = 2·Ir 을 넣어 직접 잰다. */
function durationFor(cfg, baseP, amp, level, tmax) {
    var dir = cfg.stimSign < 0 ? 1 : -1;
    var P = baseP.slice();
    P[13] = 0; P[14] = 0; P[15] = 1; P[17] = 1; P[16] = 0;
    P[5] = dir * amp; P[6] = dir * amp;

    function fires(t) {
        P[7] = t;
        var span = P[1] + P[4] + P[7] + P[10] + P[12];
        P[18] = Math.max(baseP[18], span);
        return simulateOnce(cfg, P).vmax >= level;
    }

    if (!fires(tmax)) return null;              // 이 전류로는 끝까지 안 남
    var lo = 0, hi = tmax, mid, n;
    for (n = 0; n < 22; n++) {
        mid = (lo + hi) / 2;
        if (fires(mid)) hi = mid; else lo = mid;
    }
    return hi;
}

/* I = Ir(1 + C/t)  →  I = Ir + (Ir·C)·(1/t)  :  1/t 에 대한 직선맞춤 */
function fitStrengthDuration(pts) {
    var n = pts.length, i, x, y;
    if (n < 2) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (i = 0; i < n; i++) {
        x = 1 / pts[i].dur; y = pts[i].i;
        sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    var den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-20) return null;
    var slope = (n * sxy - sx * sy) / den;
    var inter = (sy - slope * sx) / n;
    if (!(inter > 0) || !(slope > 0)) return { Ir: inter, C: NaN, slope: slope, r2: NaN };

    /* 결정계수 */
    var mean = sy / n, ssTot = 0, ssRes = 0, f;
    for (i = 0; i < n; i++) {
        x = 1 / pts[i].dur;
        f = inter + slope * x;
        ssTot += (pts[i].i - mean) * (pts[i].i - mean);
        ssRes += (pts[i].i - f) * (pts[i].i - f);
    }
    return { Ir: inter, C: slope / inter, slope: slope,
             r2: ssTot > 0 ? 1 - ssRes / ssTot : NaN };
}

global.SD = {
    simulateOnce: simulateOnce,
    recordEpisode: recordEpisode,
    thresholdFor: thresholdFor,
    durationFor: durationFor,
    tauForStep: tauForStep,
    fit: fitStrengthDuration
};

})(window);

/* ------------------------------------------------------------------
 * reconstruct.js -- 활동전압 재구성 (매뉴얼 II-6)
 *
 * "m, n, h 에 대하여 막전압에 따른 alpha, beta 의 변화를 알아냈다면
 *  이를 기반으로 어떻게 활동전압을 재구성할 수 있는가"
 *
 * 이 파일은 HeartModel 을 쓰지 않고 α·β 와 막방정식만으로 처음부터
 * 적분한다.  그래야 "rate constant 만 있으면 활동전압이 나온다" 는
 * 것이 코드에서도 드러난다.
 *
 *      dm/dt = α_m(V)(1−m) − β_m(V)m       (h, n 도 같은 꼴)
 *      I_Na  = ḡ_Na·m³h·(V − E_Na)
 *      I_K   = ḡ_K ·n⁴ ·(V − E_K)
 *      C·dV/dt = −(I_Na + I_K + I_leak) + I_stim
 * ------------------------------------------------------------------ */
(function (global) {
'use strict';

var R = 8.3143, F = 96.4867;
var exp = Math.exp, abs = Math.abs;

/* --- Hodgkin-Huxley rate constants (heart10Doc.cpp 와 동일) --------- */
function rates(V) {
    var xm = 25 - V - 65, xn = 10 - V - 65;
    return {
        am: (abs(xm) < 1e-6) ? 1.0 : 0.1 * xm / (exp(xm / 10) - 1),
        bm: 4 * exp((-65 - V) / 18),
        ah: 0.07 * exp((-65 - V) / 20),
        bh: 1 / (exp((30 - V - 65) / 10) + 1),
        an: (abs(xn) < 1e-6) ? 0.1 : 0.01 * xn / (exp(xn / 10) - 1),
        bn: 0.125 * exp((-V - 65) / 80)
    };
}

/* 측정한 α_n·β_n 을 쓰는 경우: 막전압으로 선형보간 (양 끝은 고정) */
function interpRate(pts, V, key) {
    if (!pts || pts.length === 0) return null;
    if (V <= pts[0].V) return pts[0][key];
    if (V >= pts[pts.length - 1].V) return pts[pts.length - 1][key];
    for (var i = 1; i < pts.length; i++) {
        if (V <= pts[i].V) {
            var f = (V - pts[i - 1].V) / ((pts[i].V - pts[i - 1].V) || 1e-30);
            return pts[i - 1][key] + f * (pts[i][key] - pts[i - 1][key]);
        }
    }
    return pts[pts.length - 1][key];
}

/* par:
     gNa, gK, gLeak, rgLeakK   전도도 (nA/mV)
     Cap                        막용량 (nF)
     Nae, Nai, Ke, Ki, tempC    역전전위 계산용
     Rseal                      MOhm
     settle, t0, dur, amp, T, dt
     measured                   II-4 에서 잰 {V, alpha, beta} 배열 (없으면 HH 식)
*/
function reconstruct(par) {
    var RTF = R * (par.tempC + 273.15) / F;
    var ENa = RTF * Math.log(par.Nae / par.Nai);
    var EK = RTF * Math.log(par.Ke / par.Ki);

    var dt = par.dt || 0.01;
    var V = par.V0 !== undefined ? par.V0 : -67;
    var r = rates(V);
    var m = r.am / (r.am + r.bm);
    var h = r.ah / (r.ah + r.bh);
    var n = r.an / (r.an + r.bn);

    var out = { t: [], V: [], m: [], h: [], n: [], gNa: [], gK: [],
                INa: [], IK: [], dVdt: [], Istim: [], ENa: ENa, EK: EK };

    var settle = par.settle || 0;          // 자극 전에 안정시키는 시간
    var total = settle + par.T;
    var t = 0, steps = Math.ceil(total / dt), i;

    for (i = 0; i <= steps; i++) {
        t = i * dt;
        var tr = t - settle;               // 기록상의 시각 (자극 기준)

        r = rates(V);
        var an = r.an, bn = r.bn;
        if (par.measured && par.measured.length) {
            var ma = interpRate(par.measured, V, 'alpha');
            var mb = interpRate(par.measured, V, 'beta');
            if (ma !== null && isFinite(ma) && ma > 0) an = ma;
            if (mb !== null && isFinite(mb) && mb > 0) bn = mb;
        }

        var gNa = par.gNa * m * m * m * h;
        var gK = par.gK * n * n * n * n;
        var INa = gNa * (V - ENa);
        var IK = gK * (V - EK);
        var ILeak = par.gLeak * (V - ENa) + par.gLeak * par.rgLeakK * (V - EK);
        var Istim = (tr >= par.t0 && tr < par.t0 + par.dur) ? par.amp : 0;

        /* 원본과 같은 부호 규약: 자극은 막전류에 더해지고 dV/dt = −Itot/C.
           매뉴얼 기준(+ = 탈분극)이면 stimSign = −1 이 곱해져 있다. */
        var Itot = INa + IK + ILeak + Istim * (par.stimSign || 1) + V / (par.Rseal || 1e5);
        var dVdt = -Itot / par.Cap;

        if (tr >= 0) {
            out.t.push(tr); out.V.push(V); out.m.push(m); out.h.push(h); out.n.push(n);
            out.gNa.push(gNa); out.gK.push(gK);
            out.INa.push(INa); out.IK.push(IK); out.dVdt.push(dVdt);
            out.Istim.push(Istim);
        }

        /* 게이트는 지수해, 막전압은 Euler (원본 CalSteps 와 같은 방식) */
        var tm = 1 / (r.am + r.bm), th = 1 / (r.ah + r.bh), tn = 1 / (an + bn);
        m += (r.am * (1 - m) - r.bm * m) * tm * (1 - exp(-dt / tm));
        h += (r.ah * (1 - h) - r.bh * h) * th * (1 - exp(-dt / th));
        n += (an * (1 - n) - bn * n) * tn * (1 - exp(-dt / tn));
        V += dVdt * dt;

        if (!isFinite(V) || abs(V) > 400) break;
    }
    return out;
}

/* 재구성 결과에서 설명에 쓸 주요 시점을 뽑는다 */
function landmarks(res, stimT0) {
    function at(idx, label) {
        if (idx < 0 || idx >= res.t.length) return null;
        return { label: label, t: res.t[idx], V: res.V[idx], m: res.m[idx],
                 h: res.h[idx], n: res.n[idx], gNa: res.gNa[idx], gK: res.gK[idx],
                 INa: res.INa[idx], IK: res.IK[idx], dVdt: res.dVdt[idx] };
    }
    var i, iStim = 0, iUp = 0, iPeak = 0, iDown, iAhp;
    for (i = 0; i < res.t.length; i++) {
        if (res.t[i] <= stimT0) iStim = i;
        if (res.dVdt[i] > res.dVdt[iUp]) iUp = i;
        if (res.V[i] > res.V[iPeak]) iPeak = i;
    }
    iDown = iPeak; iAhp = iPeak;
    for (i = iPeak; i < res.t.length; i++) if (res.dVdt[i] < res.dVdt[iDown]) iDown = i;
    for (i = iPeak; i < res.t.length; i++) if (res.V[i] < res.V[iAhp]) iAhp = i;

    return [at(iStim, '자극 직전'), at(iUp, '최대 dV/dt (상승기)'),
            at(iPeak, '정점 (overshoot)'), at(iDown, '최대 −dV/dt (재분극)'),
            at(iAhp, 'AHP 최저'), at(res.t.length - 1, '회복')]
           .filter(function (x) { return x; });
}

global.RECON = { reconstruct: reconstruct, rates: rates, landmarks: landmarks };

})(window);

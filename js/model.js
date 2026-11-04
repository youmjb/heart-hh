/* ------------------------------------------------------------------
 * model.js -- JavaScript port of Heart_HH (heart10Doc.cpp)
 *
 * Direct translation of CHeart10Doc.  Variable names, array indices and
 * the order of operations follow the original C++ so that the numerical
 * results match the Windows program.
 *
 *   Pulse[0..18]     pulse protocol              (see heart10Doc.h)
 *   SF[3..14,19..23] scale factors
 *   Ion[0..6]        0:Nae 1:Nai 2:Ke 3:Ki 4:Cae 5:Cat 6:Mgi
 *   Condition[0..3]  0:Raccess 1:Rseal 2:Vglass/Vcell 3:temperature
 *   m_AP             0 = current clamp (action potential), 1 = voltage clamp
 * ------------------------------------------------------------------ */
(function (global) {
'use strict';

var R = 8.3143;                 // Joule/K/mole
var F = 96.4867;                // Coulomb/mM
var Elementarycharge = 1.602e-19;
var NOP = 14;                   // number of channel parameter sets

var exp = Math.exp, log = Math.log, pow = Math.pow, abs = Math.abs;

function dim2(a, b) {
    var A = new Array(a), i, j;
    for (i = 0; i < a; i++) { A[i] = new Array(b); for (j = 0; j < b; j++) A[i][j] = 0; }
    return A;
}
function dim3(a, b, c) {
    var A = new Array(a), i, j, k;
    for (i = 0; i < a; i++) {
        A[i] = new Array(b);
        for (j = 0; j < b; j++) { A[i][j] = new Array(c); for (k = 0; k < c; k++) A[i][j][k] = 0; }
    }
    return A;
}
function zeros(n) { var A = new Array(n), i; for (i = 0; i < n; i++) A[i] = 0; return A; }

function HeartModel() {
    this.Pulse     = zeros(19);
    this.SF        = zeros(25);
    this.Ion       = zeros(10);
    this.Condition = zeros(4);

    this.C   = dim3(7, 8, 3);       // concentrations; C[6] = membrane potential
    this.Org = dim3(3, 8, 3);       // organelle variables
    this.m   = dim3(NOP + 1, 10, 3);
    this.mm  = dim3(NOP + 1, 10, 3);
    this.h   = dim3(NOP + 1, 10, 3);
    this.hh  = dim3(NOP + 1, 10, 3);
    this.ii  = dim3(25, 6, 3);      // currents

    this.RateM  = dim2(NOP + 1, 7);
    this.RateMM = dim2(NOP + 1, 7);
    this.RateH  = dim2(NOP + 1, 7);
    this.RateHH = dim2(NOP + 1, 7);

    this.Vm = zeros(3); this.VNa = zeros(3); this.VK = zeros(3); this.VCa = zeros(3);
    this.Caf = zeros(3); this.Cafb = zeros(3); this.Cafrel = zeros(3);
    this.TRPNf = zeros(3); this.CMDNf = zeros(3); this.CSQNf = zeros(3);
    this.KCF = zeros(3); this.NaCF = zeros(3); this.CaCF = zeros(3);
    this.Itot = zeros(3); this.Itotb = zeros(3); this.Itot_vm = zeros(3);
    this.Icap = zeros(3); this.Icapb = zeros(3);
    this.Iinj = zeros(3);
    this.ICanet = zeros(3); this.IKnet = zeros(3); this.INanet = zeros(3);
    this.Itr = zeros(3); this.Irel = zeros(3); this.Iup = zeros(3);
    this.K30 = zeros(3); this.K03 = zeros(3);
    this.d = zeros(3);

    this.GbCa = zeros(3); this.GILNSCNa = zeros(3); this.GNa = zeros(3);
    this.GITOK = zeros(3); this.GIsusK = zeros(3); this.GIRK1 = zeros(3);
    this.GKr = zeros(3); this.GIKsK = zeros(3); this.GNaHH = zeros(3); this.GIKdr = zeros(3);
    this.GfK = zeros(3); this.GfNa = zeros(3); this.ACh = zeros(3);
    this.INaKmax = zeros(3); this.INaCaMax = zeros(3);
    this.PCaL = zeros(3); this.PCaT = zeros(3);

    this.cellNo = 1;
    this.NewCell = true;
    this.bUserRate = false;
    this.bHH = true;
    /* false = ohmic (Vm-E) driving force, as in heart10Doc.cpp (2013)
       true  = constant-field NaCF/KCF, as in heart10Doc_HH.cpp (2008)   */
    this.bConstantField = false;
    /* +1 = literal source behaviour, -1 = positive pulse depolarises */
    this.stimSign = 1;
    this.m_AP = 0;
    this.m_FixedTimeInterval = 0;
    this.limitfactor = 0;
    this.iterative = 200;
    this.episodeN = 0;
    this.CurrentTime = 0;
    this.TotalTime = 0;
    this.timeinterval = 0.01;
    this.timeintervalb = 0.01;
    this.E = 0; this.E0 = 0; this.Erev = -67;
    this.vmSolveIterations = 0;
}

/* ------------------------------------------------------------------ */
/* initialisation                                                     */
/* ------------------------------------------------------------------ */
HeartModel.prototype.InputAll = function () {
    this.d[1] = 1; this.d[2] = 0;
    this.limitfactor = 0;
};

HeartModel.prototype.DefInitialVarInput = function () {
    for (var L = 1; L <= this.cellNo; L++) {
        this.C[1][6][L] = this.Ion[3];
        this.C[2][6][L] = this.Ion[1];
        this.C[3][6][L] = this.Ion[5];
        this.C[1][7][L] = this.C[1][6][L];
        this.C[2][7][L] = this.C[2][6][L];
        this.C[3][7][L] = this.C[3][6][L];
    }
};

HeartModel.prototype.DefIonVar = function () {
    this.Ke  = this.Ion[2];
    this.Nae = this.Ion[0];
    this.Cae = this.Ion[4];
    this.Mgi = this.Ion[6];
};

HeartModel.prototype.DefScaleVar = function () {
    var SF = this.SF;
    this.Cap = SF[23] * 132.0 / 1000.0;                       // nF
    this.Vi = 100.0 * 20.0 * 8.0 / 2.0 * 0.001;               // um^3
    this.Vtotal = this.Condition[2] * this.Vi;

    this.GIRK1[1]  = SF[3]  * 0.8 * 1800.0 / 20.0 / 1000.0 * SF[23];
    this.GNa[1]    = SF[4]  * 1.875 * 58.0 / 1000.0 * SF[23];
    this.GKr[1]    = SF[5]  * 0.132 * 0.108 * 0.3 * SF[23];
    this.GITOK[1]  = SF[6]  * 1.5 / 1000 * SF[23];
    this.GIsusK[1] = SF[7]  * 0.3 / 1000 * SF[23];
    this.PCaL[1]   = SF[8]  * 24 * 40 / 1000 * SF[23];
    this.PCaT[1]   = SF[9]  * 0.066 / 0.05 * SF[23];
    this.GIKsK[1]  = SF[10] * 0.247 * 2.5 / 2 / 1000 * SF[23];

    this.GfK[1]  = SF[11] * 7.4 / 1000 * SF[23];
    this.GfNa[1] = SF[11] * 4.6 / 1000 * SF[23];
    this.ACh[1]  = SF[12] * SF[23];
    this.GNaHH[1] = SF[13] * 200 / 1000.0 * SF[23];
    this.GIKdr[1] = SF[14] * 60 / 1000.0 * SF[23];

    this.GbCa[1]     = SF[19] * 0.01 * 275 / 1000 * SF[23];
    this.GILNSCNa[1] = SF[20] * 0.0561 * 1.5 / 1000 * SF[23];
    this.BasalRate = 250.0;
    this.NumberofCareer = 0.132 * 100.0 * 2000.0 * 4.0 * SF[23];

    this.INaCaMax[1] = SF[21] * this.NumberofCareer * Elementarycharge * 1e12 * this.BasalRate;
    this.INaKmax[1]  = SF[22] * 0.132 * 2.88 * 1.3 * SF[23];
};

HeartModel.prototype.INITIALSETTING = function () {
    this.timeinterval = 0.01;
    this.timeintervalb = 0.01;
    this.CurrentTime = 0.0;

    this.E = this.Pulse[0];

    this.RTF  = R * (this.Condition[3] + 273.15) / F;
    this.RTF2 = R * (this.Condition[3] + 273.15) / F / 2.0;
    if (!this.bHH) {
        this.Erev = this.RTF * log(
            (this.Ke + this.Nae * 0.002 + this.Cae * 4 * 0.002) /
            (this.C[1][6][1] + this.C[2][6][1] * 0.005 + this.C[3][6][1] * 4 * 0.005));
    } else {
        this.Erev = -67;
    }

    this.rNaCa = 0.5;
    this.dNaCa = 0.0001;
    this.KmTRPN = 0.5 * 0.001;
    this.KmCMDN = 2.38 * 0.001;
    this.TRPNt = 0.07 * 0.7;
    this.CMDNt = 0.05 * 0.7;
    this.TRPNf[1] = this.TRPNt; this.CMDNf[1] = this.CMDNt;
    this.TRPNf[2] = this.TRPNt; this.CMDNf[2] = this.CMDNt;

    this.KmCSQN = 0.8;
    this.CSQNt = 10.0;

    this.Vrel = 0.004 * this.Vi;
    this.Vup  = 0.06 * this.Vi * 3.0;

    this.Caupmax = 5.0;
    this.Taurel = 1.0;
    this.Tautr = 200.0 * 11.0;
    this.TauUp = 0.05;
    this.KmCa = 0.001;

    this.Arel = 2.0 * this.Vrel * F / this.Taurel;
    this.Atr  = 2.0 * this.Vi * F / this.Tautr;
    this.Aup  = 2.0 * this.Vi * F / this.TauUp;

    this.RGKNA = 0.086;
    this.RGITONa = 0.09;
    this.RGIsusNa = 0.09;
    this.RGIKsNa = 0.04;
    this.RGILNSCK = 1.4;
    this.KmNa = 11.0;

    this.KNaCa = 0.012;
    this.Partition_v = 0.32;

    this.KNAI = pow(87.5, 3.0) * 0.0036;
    this.KNAO = pow(87.5, 3.0);
    this.KCaI = 1.38 * 0.0036;
    this.KCaO = 1.38;

    this.PCaLK = 0.002;
    this.PCaLNa = 0.0001;

    for (var L = 1; L <= this.cellNo; L++) {
        this.VNa[L] = this.RTF * log(this.Nae / this.C[2][6][L]);
        this.VK[L]  = this.RTF * log(this.Ke / this.C[1][6][L]);
        this.VCa[L] = this.RTF2 * log(this.Cae / 1e-4);
    }
};

HeartModel.prototype.DefInitialVarPreset = function () {
    for (var L = 1; L <= this.cellNo; L++) {
        this.Org[1][6][L] = 0.9459136;
        this.Org[2][6][L] = 0.996709;
        this.C[4][6][L] = 4.608456;
        this.C[5][6][L] = 13.11168;
        this.C[4][7][L] = this.C[4][6][L];
        this.C[5][7][L] = this.C[5][6][L];
    }
};

/* ------------------------------------------------------------------ */
/* resting / holding membrane potential                               */
/* ------------------------------------------------------------------ */
HeartModel.prototype.calculatevm = function () {
    var L, N, qr, guard = 0;
    for (L = 1; L <= this.cellNo; L++) {
        if (this.m_AP === 0) { this.Vm[L] = this.Erev; this.iterative = 200; }
        else                 { this.Vm[L] = this.Pulse[0]; this.iterative = 40; }
    }
    qr = 0;

    do {
        for (L = 1; L <= this.cellNo; L++) {
            if (abs(this.d[L]) > this.limitfactor) {
                this.Vm[L] = this.Vm[L] + pow(-1.0, qr) * 0.0005 * qr * this.iterative;
            }
        }

        this.CABUFFER();

        for (L = 1; L <= this.cellNo; L++) {
            this.VNa[L] = this.RTF * log(this.Nae / this.C[2][6][L]);
            this.VK[L]  = this.RTF * log(this.Ke / this.C[1][6][L]);
            this.VCa[L] = this.RTF2 * log(this.Cae / this.Caf[L]);
        }

        this.constantfield_noma();
        this.RateConstants();

        for (L = 1; L <= this.cellNo; L++) {
            for (N = 3; N <= NOP; N++) {
                this.m[N][6][L] = this.m[N][1][L] / (this.m[N][1][L] + this.m[N][2][L]);
                this.m[N][7][L] = this.m[N][6][L];
                this.h[N][6][L] = this.h[N][1][L] / (this.h[N][1][L] + this.h[N][2][L]);
                this.h[N][7][L] = this.h[N][6][L];
            }
            for (N = 1; N <= 2; N++) {
                this.Org[N][6][L] = this.Org[N][1][L] / (this.Org[N][1][L] + this.Org[N][2][L]);
                this.Org[N][7][L] = this.Org[N][6][L];
            }
            this.mm[5][6][L] = this.mm[5][1][L] / (this.mm[5][1][L] + this.mm[5][2][L]);
            this.mm[5][7][L] = this.mm[5][6][L];
            this.hh[4][6][L] = this.hh[4][1][L] / (this.hh[4][1][L] + this.hh[4][2][L]);
            this.hh[4][7][L] = this.hh[4][6][L];
            this.m[3][6][L] = this.m[3][1][L] /
                (this.m[3][1][L] + this.m[3][2][L] * pow(1 - this.h[3][3][L], 3.0));
            this.m[3][7][L] = this.m[3][6][L];
        }
        this.DefSteps(0);
        this.currentamplitude();

        for (L = 1; L <= this.cellNo; L++) {
            if (abs(this.d[L]) > this.limitfactor) {
                this.Itot_vm[L] = this.Itot_vm[L] + this.Vm[L] / this.Condition[1];
            }
            if (this.m_AP === 0) {
                this.d[1] = this.Itot_vm[1];
                this.limitfactor = 0.02;
            } else {
                this.d[1] = this.Pulse[0] - this.Vm[1] - this.Itot_vm[1] * this.Condition[0];
                this.limitfactor = 0.1;
            }
        }
        qr = qr + 1;
        guard++;
    } while (!(abs(this.d[1]) < this.limitfactor) && guard < 200000);
    this.vmSolveIterations = guard;

    for (L = 1; L <= this.cellNo; L++) {
        for (N = 3; N <= NOP; N++) {
            this.m[N][7][L] = this.m[N][6][L];
            this.h[N][7][L] = this.h[N][6][L];
        }
        this.mm[5][7][L] = this.mm[5][6][L];
        this.hh[4][7][L] = this.hh[4][6][L];
        for (N = 1; N <= 2; N++) this.Org[N][7][L] = this.Org[N][6][L];
        this.C[6][7][L] = this.Vm[L];
        this.C[6][6][L] = this.C[6][7][L];
    }
};

/* ------------------------------------------------------------------ */
/* one integration step                                               */
/* ------------------------------------------------------------------ */
HeartModel.prototype.CalSteps = function () {
    var L;
    if (this.bHH) {
        /* Vm -> alpha,beta,m -> Itot -> dV/dt -> new Vm */
        this.MemoryCurrent();
        this.CABUFFER();
        this.VNa[1] = this.RTF * log(this.Nae / this.C[2][6][1]);
        this.VK[1]  = this.RTF * log(this.Ke / this.C[1][6][1]);
        this.VCa[1] = this.RTF2 * log(this.Cae / this.Caf[1]);

        this.RateConstants();

        this.constantfield_noma();
        this.DefSteps(this.m_AP);
        this.currentamplitude();

        this.differen();

        var dmdt = this.m[13][5][1], dhdt = this.h[13][5][1], dndt = this.m[14][5][1];
        var taum = 1 / (this.m[13][1][1] + this.m[13][2][1]);
        var tauh = 1 / (this.h[13][1][1] + this.h[13][2][1]);
        var taun = 1 / (this.m[14][1][1] + this.m[14][2][1]);

        /* m(dt) = minf + (m0 - minf)*exp(-dt/tau) */
        this.m[13][6][1] += dmdt * taum * (1 - exp(-this.timeinterval / taum));
        this.h[13][6][1] += dhdt * tauh * (1 - exp(-this.timeinterval / tauh));
        this.m[14][6][1] += dndt * taun * (1 - exp(-this.timeinterval / taun));

        if (this.m_AP === 0) {
            this.C[6][5][1] = -1.0 / this.Cap * this.Itot[1];
        } else {
            this.C[6][5][1] = 1.0 / this.Cap *
                ((this.E - this.C[6][6][1]) / this.Condition[0] - this.Itot[1] + this.Icap[1]);
        }

        if (this.m_AP === 1) {
            this.C[6][7][1] = this.C[6][6][1];
            this.C[6][6][1] = this.C[6][7][1] + this.C[6][5][1] * this.Condition[0] * this.Cap *
                (1.0 - exp(-(this.timeinterval) / this.Condition[0] / this.Cap));
        } else {
            this.C[6][7][1] = this.C[6][6][1];
            this.C[6][6][1] = this.C[6][7][1] + this.C[6][5][1] * this.timeinterval;
        }
        this.Vm[1] = this.C[6][6][1];
        this.CurrentTime += this.timeinterval;
    } else {
        this.MemoryCurrent();
        this.CABUFFER();
        for (L = 1; L <= this.cellNo; L++) {
            this.VNa[L] = this.RTF * log(this.Nae / this.C[2][6][L]);
            this.VK[L]  = this.RTF * log(this.Ke / this.C[1][6][L]);
            this.VCa[L] = this.RTF2 * log(this.Cae / this.Caf[L]);
        }
        this.RateConstants();
        this.constantfield_noma();
        this.DefSteps(this.m_AP);
        this.currentamplitude();
        this.differen();
        this.RUNGEKUTTA();
        this.CurrentTime += this.timeinterval;
    }
};

HeartModel.prototype.CABUFFER = function () {
    for (var L = 1; L <= this.cellNo; L++) {
        var N;
        for (N = 1; N <= 10; N++) {
            this.Caf[L] = this.C[3][6][L] /
                (1.0 + (this.TRPNf[L] / this.KmTRPN) + (this.CMDNf[L] / this.KmCMDN));
            this.TRPNf[L] = this.TRPNt / (1.0 + (this.Caf[L] / this.KmTRPN));
            this.CMDNf[L] = this.CMDNt / (1.0 + (this.Caf[L] / this.KmCMDN));
        }
        for (N = 1; N < 10; N++) {
            this.Cafrel[L] = this.C[5][6][L] / (1.0 + (this.CSQNf[L] / this.KmCSQN));
            this.CSQNf[L] = this.CSQNt / (1.0 + (this.Cafrel[L] / this.KmCSQN));
        }
    }
};

HeartModel.prototype.constantfield_noma = function () {
    for (var L = 1; L <= this.cellNo; L++) {
        var Vm = this.Vm[L];
        this.RTF  = R * (this.Condition[3] + 273.15) / F;
        this.RTF2 = R * (this.Condition[3] + 273.15) / F / 2.0;

        if (Vm === 50.0) this.CaCF[L] = 1.000654;
        else this.CaCF[L] = ((Vm - 50.0) / this.RTF2) / (1 - exp(-(Vm - 50.0) / this.RTF2));
        this.CaCF[L] = this.CaCF[L] *
            (this.Caf[L] * exp(50.0 / this.RTF2) - this.Cae * exp(-(Vm - 50.0) / this.RTF2));

        if (Vm === 50.0) this.KCF[L] = 0.99906;
        else this.KCF[L] = ((Vm - 50.0) / this.RTF) / (1.0 - exp(-(Vm - 50.0) / this.RTF));
        this.KCF[L] = this.KCF[L] *
            (this.C[1][6][L] * exp(50.0 / this.RTF) - this.Ke * exp(-(Vm - 50.0) / this.RTF));

        if (Vm === 50.0) this.NaCF[L] = 0.99906;
        else this.NaCF[L] = ((Vm - 50.0) / this.RTF) / (1.0 - exp(-(Vm - 50.0) / this.RTF));
        this.NaCF[L] = this.NaCF[L] *
            (this.C[2][6][L] * exp(50.0 / this.RTF) - this.Nae * exp(-(Vm - 50.0) / this.RTF));
    }
};

/* ------------------------------------------------------------------ */
/* rate constants                                                     */
/* ------------------------------------------------------------------ */
HeartModel.prototype.RateConstants = function () {
    if (this.bUserRate) this.RateConstantsUser();
    else this.RateConstantsDefault();

    for (var L = 1; L <= this.cellNo; L++) {
        var Vm = this.Vm[L], m = this.m, h = this.h, Org = this.Org;

        /* Ih */
        m[11][1][L] = exp(-0.0220741 * (Vm + 386.9));
        m[11][2][L] = exp(0.052 * (Vm - 73.08));
        m[11][3][L] = m[11][1][L] / (m[11][1][L] + m[11][2][L]);
        m[11][4][L] = 1.0 / (m[11][1][L] + m[11][2][L]);

        h[11][1][L] = exp(-0.0220741 * (Vm + 386.9));
        h[11][2][L] = exp(0.052 * (Vm - 73.08));
        h[11][3][L] = h[11][1][L] / (h[11][1][L] + h[11][2][L]);
        h[11][4][L] = 1.0 / (h[11][1][L] + h[11][2][L]);

        /* ACh activated K */
        if (this.ACh[L] === 0.0) m[12][1][L] = 0.165 * 0.001 * 1.5;
        else m[12][1][L] = 12.32 / (1.0 + 4.2 / this.ACh[L]) * 0.001;
        m[12][2][L] = 10.0 * exp(0.0133 * (Vm + 40.0)) * 0.001;

        h[12][1][L] = exp(-0.0220741 * (Vm + 386.9));
        h[12][2][L] = exp(0.052 * (Vm - 73.08));
        h[12][3][L] = h[12][1][L] / (h[12][1][L] + h[12][2][L]);
        h[12][4][L] = 1.0 / (h[12][1][L] + h[12][2][L]);

        /* Ca transfer in the Ca store */
        if (Vm === -64.0) Org[2][1][L] = 0.0200047;
        else Org[2][1][L] = 0.000625 * 8.0 * (Vm + 64.0) / (exp(0.25 * (Vm + 64.0)) - 1.0);
        Org[2][2][L] = 0.005 * 8.0 / (1.0 + exp(-0.25 * (Vm + 64.0)));

        /* Na/Ca exchange, ping-pong */
        var PNAO = 1.0 / (1.0 + ((1.0 + this.Cae / this.KCaO) / (pow(this.Nae, 3.0) / this.KNAO)));
        var PNAI = 1.0 / (1.0 + ((1.0 + this.Caf[L] / this.KCaI) / (pow(this.C[2][6][L], 3.0) / this.KNAI)));
        var PCAO = 1.0 / (1.0 + ((1.0 + pow(this.Nae, 3.0) / this.KNAO) / (this.Cae / this.KCaO)));
        var PCAI = 1.0 / (1.0 + ((1.0 + pow(this.C[2][6][L], 3.0) / this.KNAI) / (this.Caf[L] / this.KCaI)));

        var k12 = PCAO, k21 = PCAI;
        this.K30[L] = exp(this.Partition_v * Vm / this.RTF) * PNAI;
        this.K03[L] = exp((this.Partition_v - 1.0) * Vm / this.RTF) * PNAO;
        Org[1][2][L] = this.K30[L] + k21;
        Org[1][1][L] = this.K03[L] + k12;
    }
};

HeartModel.prototype.RateConstantsDefault = function () {
    var m = this.m, mm = this.mm, h = this.h, hh = this.hh;
    for (var L = 1; L <= this.cellNo; L++) {
        var Vm = this.Vm[L], VK = this.VK[L];
        var POINF, A, B, ab, den;

        /* IRK1 */
        POINF = 1.0 / (1.0 + 0.1 * exp((Vm - VK) / 15.0) + 0.048 * exp((Vm - VK) / 7.0));
        A = 2.5 / (4.7 * exp((Vm - VK) / 28.7));
        B = 2.5 / (6.0 * exp((VK - Vm) / 25.8));
        ab = A + B;
        m[3][1][L] = POINF * ab;
        m[3][2][L] = ab;
        m[3][3][L] = m[3][1][L] / (m[3][1][L] + m[3][2][L]);
        m[3][4][L] = 1.0 / (m[3][1][L] + m[3][2][L]);
        h[3][2][L] = 26.0 * exp((VK - Vm - 6.0) / 52.0);
        h[3][1][L] = this.Mgi * 1.85 * exp((Vm - VK - 6.0) / 15.0);
        h[3][3][L] = h[3][1][L] / (h[3][1][L] + h[3][2][L]);
        h[3][4][L] = 1.0 / (h[3][1][L] + h[3][2][L]);

        /* INa (Luo & Rudy) */
        m[4][3][L] = 1.0 / (1.0 + exp((Vm + 52.0) / (-5.27)));
        m[4][4][L] = 0.02 + 1.0 / (0.4 * exp((Vm + 68.0) / (-2.9)) + 0.09 * exp((Vm + 55.0) / 4.7) + 8.0);
        m[4][1][L] = m[4][3][L] / m[4][4][L];
        m[4][2][L] = (1.0 - m[4][3][L]) / m[4][4][L];

        if (Vm >= -40.0) {
            h[4][1][L] = 0.0;
            h[4][2][L] = 1.0 / (0.13 * (1.0 + exp((Vm + 10.66) / (-11.1))));
            h[4][3][L] = h[4][1][L] / (h[4][1][L] + h[4][2][L]);
            h[4][4][L] = 1.0 / (h[4][1][L] + h[4][2][L]);
            hh[4][1][L] = 0.0;
            hh[4][2][L] = 0.3 * exp(-0.0000002535 * Vm) / (1.0 + exp(-0.1 * (Vm + 32.0)));
            hh[4][3][L] = hh[4][1][L] / (hh[4][1][L] + hh[4][2][L]);
            hh[4][4][L] = 1.0 / (hh[4][1][L] + hh[4][2][L]);
        } else {
            h[4][1][L] = 0.135 * exp((80.0 + Vm) / (-6.8));
            h[4][2][L] = 3.56 * exp(0.079 * Vm) + 310000.0 * exp(0.35 * Vm);
            h[4][3][L] = h[4][1][L] / (h[4][1][L] + h[4][2][L]);
            h[4][4][L] = 1.0 / (h[4][1][L] + h[4][2][L]);
            hh[4][1][L] = (0.000012714 * exp(0.2444 * Vm) - 0.00003474 * exp(-0.04391 * Vm)) *
                (Vm + 37.78) / (1.0 + exp(0.311 * (Vm + 79.23)));
            hh[4][2][L] = 0.1212 * exp(-0.01052 * Vm) / (1.0 + exp(-0.1378 * (Vm + 40.14)));
            hh[4][3][L] = hh[4][1][L] / (hh[4][1][L] + hh[4][2][L]);
            hh[4][4][L] = 1.0 / (hh[4][1][L] + hh[4][2][L]);
        }

        /* IKr */
        var Painfinite = 1.0 / (1.0 + exp((-23.2 - Vm) / 10.6));
        var tauaf = 1000.0 / (37.2 * exp(Vm / 15.9) + 0.96 * exp(-Vm / 22.5));
        var tauas = 1000.0 / (4.2 * exp(Vm / 17.0) + 0.15 * exp(-Vm / 21.6));
        m[5][1][L] = Painfinite / tauaf;
        m[5][2][L] = (1.0 - (1.0 / (1.0 + exp((-23.2 - Vm) / 10.6)))) /
            (1000.0 / (37.2 * exp(Vm / 15.9) + 0.96 * exp(-Vm / 22.5)));
        m[5][3][L] = (1.0 - Painfinite) / tauaf;
        m[5][4][L] = 1.0 / (m[5][1][L] + m[5][2][L]);
        mm[5][1][L] = Painfinite / tauas;
        mm[5][2][L] = (1.0 - Painfinite) / tauas;
        mm[5][3][L] = mm[5][1][L] / (mm[5][1][L] + mm[5][2][L]);
        mm[5][4][L] = 1.0 / (mm[5][1][L] + mm[5][2][L]);
        var Piinfinite = 1.0 / (1.0 + exp((Vm + 28.6) / 17.1));
        var taui = 2.0;
        h[5][1][L] = Piinfinite / taui;
        h[5][2][L] = (1 - Piinfinite) / taui;
        h[5][3][L] = h[5][1][L] / (h[5][1][L] + h[5][2][L]);
        h[5][4][L] = 1.0 / (h[5][1][L] + h[5][2][L]);

        /* Ito */
        m[6][3][L] = 1.0 / (1 + exp((Vm + 11.0) / (-8.0)));
        m[6][4][L] = 3.5 * exp(-pow((Vm / 30), 2.0)) + 1.5;
        h[6][3][L] = 1.0 / (1.0 + exp((Vm + 40.5) / 11.5));
        h[6][4][L] = 481.2 * exp(-pow(((Vm + 52.45) / 14.97), 2.0)) + 14.14;
        m[6][1][L] = m[6][3][L] / m[6][4][L];
        m[6][2][L] = (1.0 - m[6][3][L]) / m[6][4][L];
        h[6][1][L] = h[6][3][L] / h[6][4][L];
        h[6][2][L] = (1.0 - h[6][3][L]) / h[6][4][L];

        /* Isus */
        m[7][3][L] = 1.0 / (1.0 + exp((Vm + 4.3) / (-8.0)));
        m[7][4][L] = 9.0 / (1.0 + exp((Vm + 5.0) / 12.0)) + 0.5;
        h[7][3][L] = 0.4 / (1.0 + exp((Vm + 20.0) / 10.0)) + 0.6;
        h[7][4][L] = 47.0 / (1.0 + exp((Vm + 60.0) / 10.0)) + 300.0;
        m[7][1][L] = m[7][3][L] / m[7][4][L];
        m[7][2][L] = (1.0 - m[7][3][L]) / m[7][4][L];
        h[7][1][L] = h[7][3][L] / h[7][4][L];
        h[7][2][L] = (1.0 - h[7][3][L]) / h[7][4][L];

        /* ICaL */
        if (Vm === -30.0) m[8][1][L] = 0.02792845;
        else m[8][1][L] = 0.01045 * (Vm + 30.0) / (1.0 - exp(-(Vm + 30.0) / 2.5));
        if (Vm === 0.0) m[8][2][L] = 0.01052639;
        else m[8][2][L] = 0.00421 * Vm / (exp(Vm / 2.5) - 1.0);
        m[8][3][L] = m[8][1][L] / (m[8][1][L] + m[8][2][L]);
        m[8][4][L] = 1.0 / (m[8][1][L] + m[8][2][L]);

        if (Vm === -34.0) h[8][1][L] = 0.00200021;
        else h[8][1][L] = 0.000355 * (Vm + 34.0) / (exp((Vm + 34.0) / 5.633) - 1.0);
        h[8][2][L] = 0.0007 * (Vm + 64.0) / (1.0 + exp(-(Vm + 44.0) / 4.16));
        h[8][3][L] = h[8][1][L] / (h[8][1][L] + h[8][2][L]);
        h[8][4][L] = 1.0 / (h[8][1][L] + h[8][2][L]);

        /* ICaT */
        var DTinfinite = 1.0 / (1.0 + exp(-(Vm + 23.0) / 6.1));
        var tauDT = 0.6 + 5.4 / (1.0 + exp(0.03 * (Vm + 100.0)));
        m[9][1][L] = DTinfinite / tauDT;
        m[9][2][L] = (1.0 - DTinfinite) / tauDT;
        m[9][3][L] = m[9][1][L] / (m[9][1][L] + m[9][2][L]);
        m[9][4][L] = 1.0 / (m[9][1][L] + m[9][2][L]);

        var FTinfinite = 1.0 / (1 + exp((Vm + 75) / 6.6));
        var tauFT = 1.0 + 40.0 / (1 + exp(0.08 * (Vm + 65.0)));
        h[9][1][L] = FTinfinite / tauFT;
        h[9][2][L] = (1.0 - FTinfinite) / tauFT;
        h[9][3][L] = h[9][1][L] / (h[9][1][L] + h[9][2][L]);
        h[9][4][L] = 1.0 / (h[9][1][L] + h[9][2][L]);

        /* IKs */
        var XsINF = 1.0 / (1.0 + exp(-(Vm - 1.5) / 16.7));
        var TAUxs;
        if (Vm === -30.0) TAUxs = 2058.4;
        else {
            TAUxs = 0.0000719 * (Vm + 30.0) / (1.0 - exp(-0.148 * (Vm + 30.0)));
            TAUxs = TAUxs + 0.000131 * (Vm + 30.0) / ((exp(0.0687 * (Vm + 30.0)) - 1));
            TAUxs = 1.0 * 2.0 / TAUxs;
        }
        m[10][1][L] = XsINF / TAUxs;
        m[10][2][L] = 1.0 / TAUxs - m[10][1][L];
        m[10][3][L] = m[10][1][L] / (m[10][1][L] + m[10][2][L]);
        m[10][4][L] = 1.0 / (m[10][1][L] + m[10][2][L]);
        h[10][1][L] = XsINF / TAUxs;
        h[10][2][L] = 1.0 / TAUxs - h[10][1][L];
        h[10][3][L] = h[10][1][L] / (h[10][1][L] + h[10][2][L]);
        h[10][4][L] = 1.0 / (h[10][1][L] + h[10][2][L]);

        /* INa  (Hodgkin & Huxley) */
        var xm = 25 - Vm - 65;                        /* = -40 - Vm */
        den = exp(xm / 10) - 1;
        m[13][1][L] = (abs(xm) < 1e-6) ? 1.0 : 0.1 * xm / den;   /* alpha_m; 0/0 limit = 1   */
        m[13][2][L] = 4 * exp((-65 - Vm) / 18);                  /* beta_m                   */
        m[13][4][L] = 1 / (m[13][1][L] + m[13][2][L]);
        m[13][3][L] = m[13][1][L] * m[13][4][L];

        h[13][1][L] = 0.07 * exp((-65 - Vm) / 20);               /* alpha_h                  */
        h[13][2][L] = 1 / (exp((30 - Vm - 65) / 10) + 1);        /* beta_h                   */
        h[13][4][L] = 1 / (h[13][1][L] + h[13][2][L]);
        h[13][3][L] = h[13][1][L] * h[13][4][L];

        /* IKdr (Hodgkin & Huxley) */
        var xn = 10 - Vm - 65;                        /* = -55 - Vm */
        den = exp(xn / 10) - 1;
        m[14][1][L] = (abs(xn) < 1e-6) ? 0.1 : 0.01 * xn / den;  /* alpha_n; 0/0 limit = 0.1 */
        m[14][2][L] = 0.125 * exp((-Vm - 65) / 80);              /* beta_n                   */
        m[14][4][L] = 1 / (m[14][1][L] + m[14][2][L]);
        m[14][3][L] = m[14][1][L] * m[14][4][L];
    }
};

HeartModel.prototype.RateConstantsUser = function () {
    var m = this.m, mm = this.mm, h = this.h, hh = this.hh;
    var RateM = this.RateM, RateMM = this.RateMM, RateH = this.RateH, RateHH = this.RateHH;
    for (var L = 1; L <= this.cellNo; L++) {
        var Vm = this.Vm[L], VK = this.VK[L], N;
        for (N = 3; N <= NOP; N++) {
            if (N !== 11 && N !== 12) {
                m[N][3][L] = 1 / (1 + exp(-(Vm - RateM[N][1]) / RateM[N][2]));
                m[N][4][L] = (RateM[N][3] - RateM[N][4]) * exp(-pow(Vm - RateM[N][5], 2) / RateM[N][6]) + RateM[N][4];
                m[N][1][L] = m[N][3][L] / m[N][4][L];
                m[N][2][L] = (1 - m[N][3][L]) / m[N][4][L];
                h[N][3][L] = 1 / (1 + exp(-(Vm - RateH[N][1]) / RateH[N][2]));
                h[N][4][L] = (RateH[N][3] - RateH[N][4]) * exp(-pow(Vm - RateH[N][5], 2) / RateH[N][6]) + RateH[N][4];
                h[N][1][L] = h[N][3][L] / h[N][4][L];
                h[N][2][L] = (1 - h[N][3][L]) / h[N][4][L];
            }
        }
        h[3][3][L] = 1 / (1 + exp(-((Vm - VK) - RateH[3][1]) / RateH[3][2]));
        h[3][4][L] = (RateH[3][3] - RateH[3][4]) * exp(-pow((Vm - VK) - RateH[3][5], 2) / (RateH[3][6] + 1e-20)) + RateH[3][4];
        h[3][1][L] = this.Mgi * h[3][3][L] / h[3][4][L];
        h[3][2][L] = (1 - h[3][3][L]) / h[3][4][L];
        h[3][3][L] = h[3][1][L] / (h[3][1][L] + h[3][2][L]);
        h[3][4][L] = 1 / (h[3][1][L] + h[3][2][L]);

        m[3][3][L] = 0.5 / (1 + exp(-((Vm - VK) - RateM[3][1]) / RateM[3][2]));
        m[3][4][L] = (RateM[3][3] - RateM[3][4]) * exp(-pow((Vm - VK) - RateM[3][5], 2) / (RateM[3][6] + 1e-20)) + RateM[3][4];
        m[3][1][L] = m[3][3][L] / m[3][4][L];
        m[3][2][L] = (1 - m[3][3][L]) / m[3][4][L];

        hh[4][3][L] = 1 / (1 + exp(-(Vm - RateHH[4][1]) / RateHH[4][2]));
        hh[4][4][L] = (RateHH[4][3] - RateHH[4][4]) * exp(-pow(Vm - RateHH[4][5], 2) / RateHH[4][6]) + RateHH[4][4];
        hh[4][1][L] = hh[4][3][L] / hh[4][4][L];
        hh[4][2][L] = (1 - hh[4][3][L]) / hh[4][4][L];

        mm[5][3][L] = 1 / (1 + exp(-(Vm - RateMM[5][1]) / RateMM[5][2]));
        mm[5][4][L] = (RateMM[5][3] - RateMM[5][4]) * exp(-pow(Vm - RateMM[5][5], 2) / RateMM[5][6]) + RateMM[5][4];
        mm[5][1][L] = mm[5][3][L] / mm[5][4][L];
        mm[5][2][L] = (1 - mm[5][3][L]) / mm[5][4][L];
    }
};

/* ------------------------------------------------------------------ */
/* current amplitudes                                                 */
/* ------------------------------------------------------------------ */
HeartModel.prototype.currentamplitude = function () {
    var ii = this.ii, m = this.m, mm = this.mm, h = this.h, hh = this.hh, C = this.C;

    if (this.bHH) {
        var Vm = this.Vm[1];
        /* Driving force.  heart10Doc.cpp (2013) uses the ohmic form (Vm - E);
           heart10Doc_HH/_JB/_CF.cpp (2008) use the constant-field factors
           NaCF / KCF.  bConstantField selects between the two. */
        var dfNa = this.bConstantField ? this.NaCF[1] : (Vm - this.VNa[1]);
        var dfK  = this.bConstantField ? this.KCF[1]  : (Vm - this.VK[1]);

        /* INa (HH) */
        ii[13][1][1] = 0;
        ii[13][2][1] = pow(m[13][6][1], 3.0) * h[13][6][1] * this.GNaHH[1] * dfNa;
        ii[13][4][1] = ii[13][1][1] + ii[13][2][1];

        /* IKdr (HH) */
        ii[14][1][1] = pow(m[14][6][1], 4.0) * this.GIKdr[1] * dfK;
        ii[14][2][1] = 0;
        ii[14][4][1] = ii[14][1][1] + ii[14][2][1];

        /* background (leak) */
        ii[20][2][1] = this.GILNSCNa[1] * dfNa;
        ii[20][1][1] = this.GILNSCNa[1] * this.RGILNSCK * dfK;
        ii[20][4][1] = ii[20][1][1] + ii[20][2][1];

        /* capacitive transient */
        if (this.timeintervalb === 0) this.Icap[1] = this.Cap * C[6][5][1];
        else this.Icap[1] = this.Cap * (C[6][6][1] - C[6][7][1]) / this.timeintervalb;

        this.Itot_vm[1] = ii[13][4][1] + ii[14][4][1] + ii[20][4][1];
        if (this.m_AP === 0) {
            this.Itot[1] = this.Itot_vm[1] + this.Iinj[1] + Vm / this.Condition[1];
        } else {
            this.Itot[1] = this.Itot_vm[1] + this.Icap[1] + Vm / this.Condition[1];
        }
        return;
    }

    for (var L = 1; L <= this.cellNo; L++) {
        var V = this.Vm[L], KCF = this.KCF[L], NaCF = this.NaCF[L], CaCF = this.CaCF[L];

        /* INa */
        ii[4][1][L] = pow(m[4][6][L], 3.0) * h[4][6][L] * hh[4][6][L] * this.GNa[L] * this.RGKNA * KCF;
        ii[4][2][L] = pow(m[4][6][L], 3.0) * h[4][6][L] * hh[4][6][L] * this.GNa[L] * NaCF;
        ii[4][4][L] = ii[4][1][L] + ii[4][2][L];

        if (this.timeintervalb === 0) this.Icap[L] = this.Cap * C[6][5][L];
        else this.Icap[L] = this.Cap * (C[6][6][L] - C[6][7][L]) / this.timeintervalb;

        /* Ito */
        ii[6][1][L] = (m[6][6][L] * h[6][6][L]) * this.GITOK[L] * KCF;
        ii[6][2][L] = (m[6][6][L] * h[6][6][L]) * this.GITOK[L] * this.RGITONa * NaCF;
        ii[6][4][L] = ii[6][1][L] + ii[6][2][L];

        /* Isus */
        ii[7][1][L] = m[7][6][L] * h[7][6][L] * this.GIsusK[L] * KCF;
        ii[7][2][L] = m[7][6][L] * h[7][6][L] * this.GIsusK[L] * this.RGIsusNa * NaCF;
        ii[7][4][L] = ii[7][1][L] + ii[7][2][L];

        /* ICaL */
        var ICaLCainf = this.PCaL[L] * CaCF;
        var ICaLKinf  = this.PCaLK * this.PCaL[L] * KCF;
        var ICaLNainf = this.PCaLNa * this.PCaL[L] * NaCF;
        ii[8][3][L] = ICaLCainf * m[8][6][L] * h[8][6][L];
        ii[8][1][L] = ICaLKinf * m[8][6][L] * h[8][6][L];
        ii[8][2][L] = ICaLNainf * m[8][6][L] * h[8][6][L];
        ii[8][4][L] = ii[8][1][L] + ii[8][2][L] + ii[8][3][L];

        /* ICaT */
        var ICaTInf = 2 * this.PCaT[L] * CaCF;
        ii[9][4][L] = m[9][6][L] * h[9][6][L] * ICaTInf;

        /* IKr */
        var FF = 0.6, FS = 0.4;
        var PA = FF * m[5][6][L] + FS * mm[5][6][L];
        var PI = h[5][6][L];
        ii[5][4][L] = this.GKr[L] * PA * PI * (V - this.VK[L]);

        /* IRK1 */
        ii[3][4][L] = this.GIRK1[L] * (V - this.VK[L]) * pow((this.Ke / 5.4), 0.62) *
            m[3][6][L] * (1 - h[3][3][L]);

        /* IKs */
        ii[10][1][L] = m[10][6][L] * this.GIKsK[L] * KCF;
        ii[10][2][L] = m[10][6][L] * this.RGIKsNa * this.GIKsK[L] * NaCF;
        ii[10][4][L] = ii[10][1][L] + ii[10][2][L];

        /* Ih */
        ii[11][1][L] = this.GfK[L] * (V - this.VK[L]) * pow(m[11][6][L], 2.0);
        ii[11][2][L] = this.GfNa[L] * (V - this.VNa[L]) * pow(m[11][6][L], 2.0);
        ii[11][4][L] = ii[11][1][L] + ii[11][2][L];

        /* IKACh */
        ii[12][4][L] = 0.27 / 2.0 * this.Cap * m[12][6][L] * (V - this.VK[L]) /
            (1.0 + exp((V + 20.0) / 20.0));

        /* INa (HH) -- inside the heart model it uses the constant-field driving force */
        ii[13][1][L] = 0;
        ii[13][2][L] = pow(m[13][6][L], 3.0) * h[13][6][L] * this.GNaHH[L] * NaCF;
        ii[13][4][L] = ii[13][1][L] + ii[13][2][L];

        ii[14][1][L] = pow(m[14][6][L], 4.0) * this.GIKdr[1] * this.KCF[1];
        ii[14][2][L] = 0;
        ii[14][4][L] = ii[14][1][L] + ii[14][2][L];

        /* exchanger / pump */
        ii[21][4][L] = this.INaCaMax[L] * (this.Org[1][6][L] * this.K30[L] -
            (1.0 - this.Org[1][6][L]) * this.K03[L]);
        ii[22][4][L] = (1.0 / (1.0 + pow(this.KmNa / C[2][6][L], 1.36))) *
            (1.0 - pow((V - 50.0) / 125.0 / 2.0, 2.0)) * this.INaKmax[L];

        /* background */
        ii[19][4][L] = this.GbCa[L] * CaCF;
        ii[20][2][L] = this.GILNSCNa[L] * NaCF;
        ii[20][1][L] = this.GILNSCNa[L] * this.RGILNSCK * KCF;
        ii[20][4][L] = ii[20][1][L] + ii[20][2][L];

        /* Ca kinetics */
        this.Irel[L] = this.Arel * this.Cafrel[L] / (1 + pow(this.KmCa / this.Caf[L], 2.0));
        this.Itr[L]  = this.Org[2][6][L] * this.Atr * (C[4][6][L] - this.Cafrel[L]);
        this.Iup[L]  = this.Aup * this.Caf[L] * (1.0 - (C[4][6][L] / this.Caupmax));

        this.ICanet[L] = ii[19][4][L] + ii[8][3][L] + ii[9][4][L] - 2.0 * ii[21][4][L] -
            this.Irel[L] + this.Iup[L];
        this.IKnet[L] = ii[8][1][L] + ii[5][4][L] + ii[6][1][L] + ii[7][1][L] + ii[10][1][L] +
            ii[4][1][L] + ii[3][4][L] - 2.0 * ii[22][4][L] + ii[11][1][L] + ii[12][4][L] + ii[14][1][L];
        this.INanet[L] = ii[20][2][L] + ii[8][2][L] + ii[6][2][L] + ii[7][2][L] + ii[4][2][L] +
            ii[10][2][L] + ii[13][2][L] + 3.0 * ii[21][4][L] + 3.0 * ii[22][4][L] + ii[11][2][L];

        this.Itot_vm[L] = ii[3][4][L] + ii[4][4][L] + ii[5][4][L] + ii[6][4][L] + ii[7][4][L] +
            ii[8][4][L] + ii[9][4][L] + ii[10][4][L] + ii[11][4][L] + ii[12][4][L] + ii[13][4][L] +
            ii[14][4][L] + ii[19][4][L] + ii[20][4][L] + ii[21][4][L] + ii[22][4][L];

        if (this.m_AP === 0) this.Itot[L] = this.Itot_vm[L] + this.Iinj[L] + V / this.Condition[1];
        else                 this.Itot[L] = this.Itot_vm[L] + this.Icap[L] + V / this.Condition[1];
    }
};

/* ------------------------------------------------------------------ */
HeartModel.prototype.MemoryCurrent = function () {
    for (var L = 1; L <= this.cellNo; L++) {
        var N;
        for (N = 3; N <= NOP; N++) this.ii[N][5][L] = this.ii[N][4][L];
        for (N = 19; N <= 22; N++) this.ii[N][5][L] = this.ii[N][4][L];
        this.Itotb[L] = this.Itot[L];
        this.Icapb[L] = this.Icap[L];
        this.Cafb[L]  = this.Caf[L];
    }
};

HeartModel.prototype.RUNGEKUTTA = function () {
    var m = this.m, mm = this.mm, h = this.h, hh = this.hh, C = this.C, Org = this.Org;
    var dt = this.timeinterval;
    for (var L = 1; L <= this.cellNo; L++) {
        var N;
        for (N = 3; N <= NOP; N++) {
            m[N][7][L] = m[N][6][L];
            h[N][7][L] = h[N][6][L];
            m[N][6][L] = m[N][7][L] + m[N][5][L] / (m[N][1][L] + m[N][2][L]) *
                (1 - exp(-dt * (m[N][1][L] + m[N][2][L])));
            h[N][6][L] = h[N][7][L] + h[N][5][L] / (h[N][1][L] + h[N][2][L]) *
                (1 - exp(-dt * (h[N][1][L] + h[N][2][L])));
        }
        mm[5][7][L] = mm[5][6][L];
        hh[4][7][L] = hh[4][6][L];
        mm[5][6][L] = mm[5][7][L] + mm[5][5][L] / (mm[5][1][L] + mm[5][2][L]) *
            (1 - exp(-dt * (mm[5][1][L] + mm[5][2][L])));
        hh[4][6][L] = hh[4][7][L] + hh[4][5][L] / (hh[4][1][L] + hh[4][2][L]) *
            (1 - exp(-dt * (hh[4][1][L] + hh[4][2][L])));

        for (N = 1; N <= 5; N++) {
            C[N][7][L] = C[N][6][L];
            C[N][6][L] = C[N][7][L] + C[N][5][L] * dt;
        }
        for (N = 1; N <= 2; N++) {
            Org[N][7][L] = Org[N][6][L];
            Org[N][6][L] = Org[N][7][L] + Org[N][5][L] / (Org[N][1][L] + Org[N][2][L]) *
                (1 - exp(-dt * (Org[N][1][L] + Org[N][2][L])));
        }
        if (this.m_AP === 1) {
            C[6][7][L] = C[6][6][L];
            C[6][6][L] = C[6][7][L] + C[6][5][L] * this.Condition[0] * this.Cap *
                (1.0 - exp(-dt / this.Condition[0] / this.Cap));
        } else {
            C[6][7][L] = C[6][6][L];
            C[6][6][L] = C[6][7][L] + C[6][5][L] * dt;
        }
        this.Vm[L] = C[6][6][L];
    }
};

HeartModel.prototype.differen = function () {
    var m = this.m, mm = this.mm, h = this.h, hh = this.hh, C = this.C, Org = this.Org;
    for (var L = 1; L <= this.cellNo; L++) {
        var N;
        for (N = 3; N <= NOP; N++) {
            m[N][5][L] = m[N][1][L] * (1.0 - m[N][6][L]) - m[N][2][L] * m[N][6][L];
            h[N][5][L] = h[N][1][L] * (1.0 - h[N][6][L]) - h[N][2][L] * h[N][6][L];
        }
        if (!this.bHH) {
            mm[5][5][L] = mm[5][1][L] * (1.0 - mm[5][6][L]) - mm[5][2][L] * mm[5][6][L];
            hh[4][5][L] = hh[4][1][L] * (1.0 - hh[4][6][L]) - hh[4][2][L] * hh[4][6][L];
            m[3][5][L] = m[3][1][L] * (1.0 - m[3][6][L]) -
                m[3][2][L] * m[3][6][L] * pow((1.0 - h[3][3][L]), 3.0);

            for (N = 1; N <= 2; N++) {
                Org[N][5][L] = Org[N][1][L] * (1.0 - Org[N][6][L]) - Org[N][2][L] * Org[N][6][L];
            }

            C[1][5][L] = -this.IKnet[L] / this.Vtotal / F;
            C[2][5][L] = -this.INanet[L] / this.Vtotal / F;
            C[3][5][L] = -this.ICanet[L] / 2.0 / this.Vtotal / F;
            C[4][5][L] = (this.Iup[L] - this.Itr[L]) / 2.0 / this.Vup / F;
            C[5][5][L] = (this.Itr[L] - this.Irel[L]) / 2.0 / this.Vrel / F;

            if (this.m_AP === 0) {
                C[6][5][L] = -1.0 / this.Cap * this.Itot[L];
            } else {
                C[6][5][L] = 1.0 / this.Cap *
                    ((this.E - C[6][6][L]) / this.Condition[0] - this.Itot[L] + this.Icap[L]);
            }
        }
    }
};

HeartModel.prototype.PrepareNextPulse = function () {
    this.Pulse[5] = this.Pulse[5] + this.Pulse[13];
    this.Pulse[6] = this.Pulse[6] + this.Pulse[13];
    this.Pulse[7] = this.Pulse[7] + this.Pulse[14];
    this.CurrentTime = 0;
    this.episodeN = this.episodeN + 1;
};

HeartModel.prototype.SetTimeInterval = function () {
    var C = this.C;
    if (this.m_FixedTimeInterval <= 0) {
        if (this.m_AP === 0) {
            if (abs(this.Iinj[1]) > 0) {
                this.timeinterval = 0.03;
            } else {
                this.timeinterval = 0.2 /
                    (1.0 + exp(-(((-abs(this.TotalTime - 700.0) + abs(this.TotalTime + 700.0)) / 2.0) - 500.0) / 200.0)) *
                    (0.1 + 1.9 / (1 + exp(abs((-abs(C[6][5][1] - 0.1) + abs(C[6][5][1] + 0.1)) / 2.0) / 0.12)));
            }
        } else {
            this.timeinterval = 1.0 /
                (1.0 + exp(-(((-abs(this.TotalTime - 2500.0) + abs(this.TotalTime + 2500.0)) / 2.0) - 500.0) / 130.0)) *
                (0.1 + 1.9 / (1 + exp(abs((-abs(C[6][5][1] - 0.1) + abs(C[6][5][1] + 0.1)) / 2.0) / 0.12)));
        }
    } else {
        this.timeinterval = this.m_FixedTimeInterval;
    }
    this.timeintervalb = this.timeinterval;
};

HeartModel.prototype.DefSteps = function (iAP) {
    var P = this.Pulse;
    this.E0 = this.E;
    var StimulusAmplitude = P[0];
    var t = (this.CurrentTime / P[18] - Math.trunc(this.CurrentTime / P[18])) * P[18];

    if (t >= 0.0 && t <= P[1]) StimulusAmplitude = P[0];
    if (t > P[1] && t <= (P[4] + P[1]))
        StimulusAmplitude = (P[3] - P[2]) * (t - P[1]) / P[4] + P[2];
    if (t > (P[1] + P[4]) && t <= (P[1] + P[4] + P[7]))
        StimulusAmplitude = (P[6] - P[5]) * (t - P[1] - P[4]) / P[7] + P[5];
    if (t > (P[1] + P[4] + P[7]) && t <= (P[1] + P[4] + P[7] + P[10]))
        StimulusAmplitude = (P[9] - P[8]) * (t - P[1] - P[4] - P[7]) / P[10] + P[8];
    if (t > (P[1] + P[4] + P[7] + P[10]) && t <= (P[1] + P[4] + P[7] + P[10] + P[12]))
        StimulusAmplitude = P[11];
    if (t > (P[1] + P[4] + P[7] + P[10] + P[12])) StimulusAmplitude = P[0];
    if (this.CurrentTime > (P[18] * P[17])) StimulusAmplitude = P[0];

    /* stimSign = +1 reproduces heart10Doc.cpp literally: Iinj is added to the
       membrane current (Itot = Itot_vm + Iinj, dV/dt = -Itot/Cap), so a
       POSITIVE pulse HYPERpolarises.  stimSign = -1 gives the usual
       electrophysiological convention (positive pulse = depolarising), which
       is what the supplied protocol files (rheobase, AnodalBreak, ...) and
       data/temp.dat assume. */
    if (iAP === 0) this.Iinj[1] = this.stimSign * StimulusAmplitude;
    else this.E = StimulusAmplitude;
};

global.HeartModel = HeartModel;
global.HEART_NOP = NOP;

})(window);

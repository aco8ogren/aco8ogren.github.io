% LEAF_SIM2  –  Multi-leaf demo with fade-in/out, spawn/despawn, swirls
% ---------------------------------------------------------------------

clear; clc; close all;
rng(1)

%% ---------- master parameters ----------------------------------------
dt          = 0.015;                      % physics step [s]
T_sim       = 30;                         % total run time [s]
n_steps     = round(T_sim/dt);

leafMax     = 15;   spawnBase = 0.02;     fadeBorder = 0.2;
N_leaves_init = 3;

swirlMax    = 2;
swirlSpawnP = 0.02;
swirlRng    = [1 3];     swirlU0Rng = [0.5 2];
swirlLifeR  = [4 10];    % plateau length (not counting rise/fall)
riseTime    = 1;         fallTime   = 1;  % globally fixed half-widths

%% ---------- plotting setup -------------------------------------------
figure('WindowState','maximized'); axis equal
xlim([0 40]); ylim([0 48]); hold on;
set(gca,'YDir','normal');

%% ---------- containers -----------------------------------------------
leaves = Leaf.empty;
swirls = Swirl.empty;

%% ---------- ambient wind (reuse swirl_wind) --------------------------
v_air_amp = 20;
v_ambient = @(x,y,z,t) [v_air_amp*sin(2*pi*y/10)*sin(2*pi*t/(dt*n_steps)); 0; 0];

%% --- initialize a few leaves
% pre-allocate for speed, then fill with random leaves
leaves(1,N_leaves_init) = makeRandomLeaf();   % allocate first
for j = 1:N_leaves_init
    leaves(j) = makeRandomLeaf();
end

%% ---------- main loop -------------------------------------------------
t = 0;
for k = 1:n_steps
    cla,  t = t + dt;

    %% -- spawn swirl occasionally -------------------------------------
    if numel(swirls) < swirlMax && rand < swirlSpawnP
        c   = [ 40*rand, 48*rand, 0 ];
        ax  = randn(1,3); ax = ax/norm(ax);
        R   = interp1([0 1], swirlRng , rand);
        U0  = interp1([0 1], swirlU0Rng, rand);
        dur = interp1([0 1], swirlLifeR, rand);

        S = Swirl(c, ax, R, U0);
        S.duration    = dur + riseTime + fallTime;
        S.rise_time   = riseTime;
        S.fall_time   = fallTime;
        S.local_time  = 0;     % start clock
        S.life        = 0;     % invisible; will ramp via advance()
        swirls(end+1) = S; %#ok<SAGROW>
    end

    %% -- advance & cull swirls ----------------------------------------
    for s = numel(swirls):-1:1
        swirls(s) = swirls(s).advance(dt);
        if swirls(s).life == 0 && swirls(s).local_time >= swirls(s).duration
            swirls(s) = [];      % delete when fully faded out
        end
    end

    %% -- update & draw each leaf --------------------------------------
    for j = numel(leaves):-1:1
        L = leaves(j);

        % composite wind (ambient + all swirls)
        v_air = v_ambient(L.x,L.y,L.z,t);
        for s = 1:numel(swirls)
            v_air = v_air + eval_swirl_at_point(swirls(s), L.x,L.y,L.z,t);
        end

        % physics step
        FM = compute_forces_and_moments(L, v_air);
        L  = newtons(L, FM, dt);

        % fade-in/out alpha
        if L.fadingIn
            L.alpha = min(1, L.alpha + L.fadeInSpeed);
            if L.alpha >= 1,  L.fadingIn = false; end
        end
        xL = xlim; yL = ylim;
        if ~L.fadingOut && ...
           (L.x < xL(1)-fadeBorder*range(xL) || L.x > xL(2)+fadeBorder*range(xL) || ...
            L.y < yL(1)-fadeBorder*range(yL) || L.y > yL(2)+fadeBorder*range(yL))
            L.fadingOut = true;
        end
        if L.fadingOut
            L.alpha = max(0, L.alpha - L.fadeOutSpeed);
        end

        leaves(j) = L;
        draw_leaf(L);

        if L.alpha == 0,  leaves(j) = []; end
    end

    % Print things about leaf 1 for debugging
    if ~isempty(leaves)
        L = leaves(1);

    end

    %% -- probabilistic leaf spawn -------------------------------------
    occFactor = 1 - numel(leaves)/leafMax;
    if rand < spawnBase*occFactor
        leaves(end+1) = makeRandomLeaf(); %#ok<SAGROW>
    end

title(sprintf('t = %.2f s   frame %d / %d   leaves = %d   swirls = %d', ...
              t, k, n_steps, numel(leaves), numel(swirls)));

    drawnow;
end

%% ---------- helper: random leaf factory ------------------------------
function L = makeRandomLeaf()
    L           = Leaf();
    L.x         = 40*rand;
    L.y         = -5 + 5*rand;
    L.R         = 0.25 + 0.1*rand;
    L.rho       = 2 + 1*randn;
    area        = pi*L.R^2;
    L.mass      = area*L.rho;
    L.momentOfInertia = 0.5*L.mass*L.R^2;
    L.alpha = 0; L.fadingIn = true; L.fadingOut = false;
    q = surfacenormal_to_quat(randn(1,3));
    [L.q1,L.q2,L.q3,L.q4] = deal(q(1),q(2),q(3),q(4));
end

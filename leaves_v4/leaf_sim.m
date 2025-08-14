% LEAF_SIM2  –  Multi-leaf demo with fade-in/out, spawn/despawn, swirls
% ---------------------------------------------------------------------

clear; clc; close all;
rng(1)

%% ---------- master parameters ----------------------------------------
% debugging
isDrawSwirl = false;
isDrawAirVelocity2D = true;
isDrawLeavesTogether = true;

% domain
% space
L_x = 80; % [m]
L_y = 48; % [m]
L_z = 5;

dt = 0.015; % physics step [s]
visual_dt = 0.015; % [s], approximate
physics_to_visual_frame_ratio = floor(visual_dt/dt);
L_t = 100; % total run time [s]
n_steps = round(L_t/dt);

% leaves
nLeafInit = 40;
nLeafMax = 80;

lambdaLeafBase = 10; % number of leaves that spawn each second (base probability, gets scaled by occupancy)
% pLeafSpawnBase = 1 - exp(-lambdaLeafBase*dt); % exact Poisson → Bernoulli

fadeLimit = 0.1;

% ambient wind
v_air_amp = 20;
v_ambient = @(x,y,z,t) [v_air_amp*sin(2*pi*y/10)*sin(2*pi*t/(dt*n_steps)) zeros(size(x)) zeros(size(x))];

% swirls
nSwirlMax    = 4;
lambdaSwirlBase = 0.2; % number of swirls that spawn each second (base probability, gets scaled by occupancy)
% pSwirlSpawnBase = 1 - exp(-lambdaSwirlBase*dt);

swirlRRng    = [5 20];     swirlU0Rng = [v_air_amp/2 v_air_amp*2];
swirlLifeR  = [4 10];    % plateau length (not counting rise/fall)
riseTime    = 1;         fallTime   = 1;  % globally fixed half-widths

%% ---------- plotting setup -------------------------------------------
figure('WindowState','maximized'); axis equal
xlim([0 L_x]); ylim([0 L_y]); hold on;
set(gca,'YDir','normal');

%% ---------- containers -----------------------------------------------
leaves = Leaf.empty;
swirls = Swirl.empty;

%% --- initialize a few leaves
% pre-allocate for speed, then fill with random leaves
leaves(1,nLeafInit) = makeRandomLeaf(L_x,L_y);   % allocate first
for j = 1:nLeafInit
    leaves(j) = makeRandomLeaf(L_x,L_y);
end

%% ---------- main loop -------------------------------------------------
t = 0;
for k = 1:n_steps
    cla,  t = t + dt;

    if isDrawAirVelocity2D
        [X,Y] = meshgrid(linspace(0,L_x,30),linspace(0,L_y,25));
        z_slice = 0;
        x = X(:); y = Y(:); z = z_slice*ones(size(x));
        v = v_ambient(x,y,z,t);
        for i = 1:numel(swirls)
            v = v + eval_swirl_at_point(swirls(i),x,y,z,t);
        end
        quiver(x,y,v(:,1),v(:,2))
    end

    %% -- spawn swirl occasionally -------------------------------------
    swirlOccupancyFraction = 1 - numel(swirls)/nSwirlMax;
    lambdaSwirl = swirlOccupancyFraction*lambdaSwirlBase*dt;
    nSwirlSpawn = poissrnd(lambdaSwirl);
    for i = 1:nSwirlSpawn
        c   = [ L_x*rand, L_y*rand, L_z*rand ];
        ax  = randn(1,3); ax = ax/norm(ax);
        R   = interp1([0 1], swirlRRng , rand);
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
        S = swirls(s);
        S = S.advance(dt);
        if isDrawSwirl
            draw_swirl(S)
        end

        % print things about S for debugging
        if s == 1
            fprintf('f%04d swirl%02d pos=[%6.2f %6.2f] life=%5.2f local_time=%d duration=%d\n',...
            k, s, S.centre(1), S.centre(2), S.life, S.local_time, S.duration);
        end

        if S.life == 0 && S.local_time >= S.duration
            swirls(s) = []; % delete when fully faded out
        else
            swirls(s) = S; % otherwise make sure the list entry gets updated
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

        if sqrt(L.vx^2 + L.vy^2 + L.vz^2) > 10
            whatshappeningnow = 10;
        end

        % fade-in/out alpha
        if L.fadingIn
            L.alpha = min(1, L.alpha + L.fadeInSpeed);
            if L.alpha >= 1,  L.fadingIn = false; end
        end

        if ~L.fadingOut && ...
           (L.x < 0 - fadeLimit*L_x || L.x > L_x + fadeLimit*L_x || ...
            L.y < 0 - fadeLimit*L_y || L.y > L_y + fadeLimit*L_y)
            L.fadingOut = true;
        end
        if L.fadingOut
            L.alpha = max(0, L.alpha - L.fadeOutSpeed);
        end

        leaves(j) = L;

        if ~isDrawLeavesTogether
            draw_leaf(L);
        end

        if L.alpha == 0,  leaves(j) = []; end
    end

    if isDrawLeavesTogether
        draw_leaves(leaves)
    end

    % Print things about leaf 1 for debugging
    if ~isempty(leaves)
        L = leaves(1);
        % fprintf('f%04d leaf%02d pos=[%6.2f %6.2f] v=[%5.2f %5.2f] α=%.2f fadeIn=%d fadeOut=%d\n',...
        % k, j, L.x, L.y, L.vx, L.vy, L.alpha, L.fadingIn, L.fadingOut);
    end

    %% -- probabilistic leaf spawn -------------------------------------
    leafOccupancyFactor = 1 - numel(leaves)/nLeafMax;
    lambdaLeaf = leafOccupancyFactor*lambdaLeafBase*dt;
    nLeafSpawn = poissrnd(lambdaLeaf);
    for i = 1:nLeafSpawn
        leaves(end+1) = makeRandomLeaf(L_x,L_y); %#ok<SAGROW>
    end

    title(sprintf(['t = %.2f s   frame %d / %d   leaves = %d /%d   swirls = %d / %d  ' ...
        'lambdaLeaf=%.3f  lambdaSwirl=%.3f'], ...
        t, k, n_steps, numel(leaves),nLeafMax, numel(swirls), nSwirlMax, ...
        lambdaLeaf, lambdaSwirl));

    if mod(k,physics_to_visual_frame_ratio) == 0
        drawnow;
    end
end

%% ---------- helper: random leaf factory ------------------------------
function L = makeRandomLeaf(L_x,L_y)
    L           = Leaf();
    L.x         = L_x*rand;
    L.y         = L_y - 10 + 10*rand;
    L.R         = 0.75 + 0.1*rand;
    L.rho       = 2 + 1*rand; % [kg/m^2]
    area        = pi*L.R^2;
    L.mass      = area*L.rho;
    L.momentOfInertia = 0.5*L.mass*L.R^2;
    L.alpha = 0; L.fadingIn = true; L.fadingOut = false;
    q = surfacenormal_to_quat(randn(1,3));
    [L.q1,L.q2,L.q3,L.q4] = deal(q(1),q(2),q(3),q(4));
end

% LEAF_SIM2  –  Multi-leaf demo with fade-in/out, spawn/despawn, swirls
% ---------------------------------------------------------------------

clear; clc; close all;
rng(1)

%% INPUT PARAMS
% debugging
isDrawSwirl = false;
isDrawAirVelocity2D = false;
isDrawLeavesTogether = true;

% space
L(1) = 80; % [m], extent in x
L(2) = 48; % [m], extent in y
L(3) = 20; % [m], extent in z

% time
L_t = 20; % total run time [s]
dt = 0.015; % physics step [s]
dtVisual = 0.015; % [s], approximate. 60 Hz is approximately 0.0167 sec per frame.
visual2physicalTimeStepRatio = floor(dtVisual/dt); 
nTimeSteps = round(L_t/dt);

% leaves
nLeafInit = 40;
nLeafMax = 80;
lambdaLeafBase = 10; % number of leaves that spawn each second (base probability, gets scaled by occupancy)
outOfBoundsFrac = [0.1 0.1 0.1]; % [-], If a leaf is out of bounds by these fractions in x, y, or z, then despawn will initiate

% leaf property limits
leaf_params = struct();
leaf_params.radius_limits = [0.65 0.85]; % [m], Leaves that spawn can have radii (R) within these bounds
leaf_params.density_limits = [1 3]; % [kg/m^2], Leaves that spawn can have area density (rho) within these bounds
leaf_params.spawn_location_limits = [0 L(1); L(2)-10 L(2); L(3)/4 3*L(3)/4]; % [m], Leaves that spawn can spawn within these spatial bounds
leaf_params.Cd_perpendicular_limits = [1.9 2.1]; % [-] Leaves that spawn can have perpendicular (face-on) drag coeffs within these bounds
leaf_params.Cd_parallel_limits = [0.25 0.35]; % [-] Leaves that spawn can have parallel (edge-on) drag coeffs within these bounds
leaf_params.Cn_max_limits = [0.4 0.6]; % [-] Leaves that spawn can have max coeff of lift within these bounds
leaf_params.aCoP_limits = [0.2 0.3]; % [-] Leaves that spawn can have center of pressure shifts (as a fraction of their radius) within these bounds (relates to how easy it is for a leaf to tumble)
leaf_params.fade_in_speed = 1*dt; 
leaf_params.fade_out_speed = 1*dt;

% ambient wind
v_air_amp = 20; % [m/s]
v_ambient = @(x,t) [v_air_amp*sin(2*pi*x(:,2)/10)*sin(2*pi*t/(dt*nTimeSteps)) zeros(size(x,1),1) zeros(size(x,1),1)]; % [m/s]
rho_air = 1.2; % [kg/m^3]

% swirls
nSwirlMax = 4;
lambdaSwirlBase = 2; % 0.2 % number of swirls that spawn each second (base probability, gets scaled by occupancy)

swirl_params = struct();
swirl_params.radius_limits = [5 10]; % [m], Swirls that spawn can have radii (R) within these bounds
swirl_params.velocity_limits = [v_air_amp/2 v_air_amp*1.5]; % [m/s], Swirls that spawn can have max velocities (U0) within these bounds
swirl_params.life_limits = [4 10]; % [s], Swirls that spawn can have life spans within these limits (the plateau length, not counting rise/fall)
swirl_params.rise_time = 1; % [s], the time it takes for a swirl to fade in
swirl_params.fall_time = 1; % [s], the time it takes for a swirl to fade out

%% PLOTTING SETUP
figure('WindowState','maximized');
axis equal
xlim([0 L(1)]); ylim([0 L(2)]); zlim([0 L(3)]); hold on;
set(gca,'YDir','normal');

%% INITIALIZE
leaves = Leaf.empty;
swirls = Swirl.empty;

leaves(1,nLeafInit) = newLeaf(leaf_params);
for j = 1:nLeafInit
    leaves(j) = newLeaf(leaf_params);
end

%% MAIN LOOP
t = 0;
for k = 1:nTimeSteps
    cla
    t = t + dt;

    if isDrawAirVelocity2D
        [X,Y] = meshgrid(linspace(0,L(1),30),linspace(0,L(2),25));
        z_slice = 0;
        x = [X(:) Y(:) z_slice*ones(size(X(:)))];
        v = v_ambient(x,t);
        for i = 1:numel(swirls)
            v = v + eval_swirl_at_point(swirls(i),x,t);
        end
        quiver(x(:,1),x(:,2),v(:,1),v(:,2))
    end

    % evaluate swirl spawn
    swirlOccupancyFraction = 1 - numel(swirls)/nSwirlMax;
    lambdaSwirl = swirlOccupancyFraction*lambdaSwirlBase*dt;
    nSwirlSpawn = poissrnd(lambdaSwirl);
    for i = 1:nSwirlSpawn
        swirl = newSwirl(L,swirl_params);
        swirls(end+1) = swirl; %#ok<SAGROW>
    end

    %% -- advance & cull swirls ----------------------------------------
    for s = numel(swirls):-1:1
        swirl = swirls(s);
        swirl = swirl.advance(dt);
        if isDrawSwirl
            draw_swirl(swirl)
        end

        % print things about swirl for debugging
        if s == 1
            % fprintf('f%04d swirl%02d pos=[%6.2f %6.2f] life=%5.2f local_time=%d duration=%d\n',...
            % k, s, swirl.center(1), swirl.center(2), swirl.life, swirl.local_time, swirl.duration);
        end

        if swirl.life == 0 && swirl.local_time >= swirl.duration
            swirls(s) = []; % delete when fully faded out
        else
            swirls(s) = swirl; % otherwise make sure the list entry gets updated
        end
    end

    %% -- update & draw each leaf --------------------------------------
    for j = numel(leaves):-1:1
        leaf = leaves(j);

        % composite wind (ambient + all swirls)
        v_air = v_ambient(leaf.x,t);
        for s = 1:numel(swirls)
            v_air = v_air + eval_swirl_at_point(swirls(s), leaf.x, t);
        end

        % physics step
        [F,M] = compute_forces_and_moments(leaf, v_air, rho_air);
        leaf  = newtons(leaf, F, M, dt);

        % A bad state catcher
        if norm(leaf.v,2) > 10
            whatshappeningnow = 10;
        end

        % fade-in/out
        if leaf.fadingIn
            leaf.alpha = min(1, leaf.alpha + leaf.fadeInSpeed);
            if leaf.alpha >= 1
                leaf.fadingIn = false;
            end
        end

        if ~leaf.fadingIn && any(leaf.x < 0 - outOfBoundsFrac.*L) || any(leaf.x > L + outOfBoundsFrac.*L)
            leaf.fadingOut = true;
        end
        if leaf.fadingOut
            leaf.alpha = max(0, leaf.alpha - leaf.fadeOutSpeed);
        end

        leaves(j) = leaf;

        if ~isDrawLeavesTogether
            draw_leaf(leaf);
        end

        if leaf.alpha == 0,  leaves(j) = []; end
    end

    if isDrawLeavesTogether
        draw_leaves(leaves)
    end

    % Print things about leaf 1 for debugging
    if ~isempty(leaves)
        leaf = leaves(1);
        fprintf('f%04d leaf%02d pos=[%6.2f %6.2f] v=[%5.2f %5.2f] α=%.2f fadeIn=%d fadeOut=%d\n',...
        k, j, leaf.x(1), leaf.x(2), leaf.v(1), leaf.v(2), leaf.alpha, leaf.fadingIn, leaf.fadingOut);
    end

    %% -- probabilistic leaf spawn -------------------------------------
    leafOccupancyFactor = 1 - numel(leaves)/nLeafMax;
    lambdaLeaf = leafOccupancyFactor*lambdaLeafBase*dt;
    nLeafSpawn = poissrnd(lambdaLeaf);
    for i = 1:nLeafSpawn
        leaves(end+1) = newLeaf(leaf_params); %#ok<SAGROW>
    end

    title(sprintf(['t = %.2f s   frame %d / %d   leaves = %d /%d   swirls = %d / %d  ' ...
        'lambdaLeaf=%.3f  lambdaSwirl=%.3f'], ...
        t, k, nTimeSteps, numel(leaves),nLeafMax, numel(swirls), nSwirlMax, ...
        lambdaLeaf, lambdaSwirl));

    if mod(k,visual2physicalTimeStepRatio) == 0
        drawnow;
    end
    pause(dt)
end

%% ---------- helper: random leaf factory ------------------------------
function leaf = newLeaf(leaf_params)
    p = leaf_params;

    leaf = Leaf();

    % Location
    for i = 1:3 % for x,y,z
        leaf.x(i) = interp1([0 1],p.spawn_location_limits(i,:), rand);
    end

    % Physical properties
    leaf.R = interp1([0 1], p.radius_limits, rand);
    leaf.rho = interp1([0 1], p.density_limits, rand);
    area = pi*leaf.R^2;
    leaf.mass = area*leaf.rho;
    leaf.momentOfInertia = 0.5*leaf.mass*leaf.R^2;

    % Aero properties
    leaf.Cd_perpendicular = interp1([0 1],p.Cd_perpendicular_limits, rand);
    leaf.Cd_parallel = interp1([0 1],p.Cd_parallel_limits, rand);
    leaf.Cn_max = interp1([0 1],p.Cn_max_limits, rand);
    leaf.aCoP = interp1([0 1],p.aCoP_limits, rand);

    % Visual properties
    leaf.alpha = 0;
    leaf.fadingIn = true;
    leaf.fadingOut = false;
    leaf.fadeInSpeed = leaf_params.fade_in_speed;
    leaf.fadeOutSpeed = leaf_params.fade_out_speed;
    
    % Orientation
    leaf_spawn_surface_normal = randn(1,3);
    q = vec_to_quat(leaf_spawn_surface_normal);
    leaf.q = q;
    leaf.normal = quat_rotate([0 0 1],leaf.q);
end

function swirl = newSwirl(W,swirl_params)
    p = swirl_params;

    center = [W(1)*rand, W(2)*rand, W(3)*rand]; % center
    rot_ax  = randn(1,3); % axis of rotation
    rot_ax = rot_ax/norm(rot_ax);
    radius   = interp1([0 1], p.radius_limits , rand);
    velocity  = interp1([0 1], p.velocity_limits, rand);
    duration = interp1([0 1], p.life_limits, rand);

    swirl = Swirl(center, rot_ax, radius, velocity);
    swirl.duration = duration + p.rise_time + p.fall_time;
    swirl.rise_time = p.rise_time;
    swirl.fall_time = p.fall_time;
    swirl.local_time = 0;
    swirl.life = 0;
end

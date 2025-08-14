% LEAF_SIM  –  Multi-leaf physics demo
% ------------------------------------------------------

clear; clc; close all;

%% ----- Simulation parameters -----------------------------------------
n_leaves  = 10;          % << change here
n_steps   = 400;
dt        = 0.015;
jitter_prob = 0.5;
v_air_amp = 24;
v_air_func = @(x,y,z,t) [v_air_amp*sin(2*pi*y/10)*sin(2*pi*t/(dt*n_steps)); 0; 0];

%% ----- Create leaves --------------------------------------------------
leaves(1,n_leaves) = Leaf();   % pre-allocate struct array
for j = 1:n_leaves
    L           = Leaf();                    % fresh random leaf
    L.x         = 20 + 8*randn();              % scatter across scene
    L.y         = 45 + 2*rand();
    L.z         = 0;
    L.vx        = 0;  L.vy = 0;  L.vz = 0;
    L.R         = 0.25 + 0.1*rand(); % [m]
    L.rho       = 3 + 1*randn();      % slight variability
    area        = pi*L.R^2;
    L.mass      = area*L.rho;
    L.momentOfInertia = 0.5*L.mass*L.R^2;

    n_init      = randn(1,3);                % random initial attitude
    n_init      = n_init / norm(n_init);
    q           = surfacenormal_to_quat(n_init);
    [L.q1,L.q2,L.q3,L.q4] = deal(q(1),q(2),q(3),q(4));

    leaves(j) = L;
end

%% ----- Plot prep ------------------------------------------------------
figure('WindowState','Maximized'); axis equal; xlim([0 40]); ylim([0 48]); hold on;
timeLine = (0:n_steps-1)*dt;

%% ----- Storage (first leaf only for plotting) ------------------------
pos1   = zeros(n_steps,3);
vel1   = zeros(n_steps,3);
force1 = zeros(n_steps,3);
mom1   = zeros(n_steps,3);
ang1   = zeros(n_steps,3);          % angular velocity
norm1  = zeros(n_steps,3);          % surface normal
didJitter1 = false(n_steps,1);

%% ----- Chaos tuners ---------------------------------------------------
gust_std   = 0.002;   % N
torque_std = 1e-5;    % N·m
doPrint    = (n_leaves == 1);

%% ----- Simulation loop -----------------------------------------------
for i = 1:n_steps
    cla;

    for j = 1:n_leaves
        v_air = v_air_func(leaves(j).x,leaves(j).y,leaves(j).z,timeLine(i));

        FM = compute_forces_and_moments(leaves(j),v_air);

        if rand() < jitter_prob
            FM = FM + leaf_jitter(leaves(j), gust_std, torque_std);
            if j==1 % record only first leaf
                didJitter1(i) = true;
            end
        end

        leaves(j) = newtons(leaves(j), FM, dt);
        draw_leaf(leaves(j));

        if j == 1
            pos1(i,:)   = [leaves(j).x,  leaves(j).y,  leaves(j).z];
            vel1(i,:)   = [leaves(j).vx, leaves(j).vy, leaves(j).vz];
            force1(i,:) = FM(1:3).';
            mom1(i,:)   = FM(4:6).';
            ang1(i,:)   = leaves(j).omega;
            norm1(i,:)  = quat_rotate([0;0;1], [leaves(j).q1 leaves(j).q2 ...
                leaves(j).q3 leaves(j).q4]).';
        end
    end

    if doPrint && mod(i,25)==1
        fprintf('#%-4d y=%.3f vy=%.3f F=[%.2f %.2f %.2f]\n',...
            i, leaves(1).y, leaves(1).vy, force1(i,:));
    end

    title(sprintf('step %d / %d', i, n_steps));
    drawnow;
end

%% ----- Plot results for leaf 1 ---------------------------------------
figure('WindowState','Maximized');
tiledlayout(5,1);

lbl = {'x','y','z'};

% -- Position
nexttile;
plot(timeLine, pos1); title('Position (leaf 1)'); ylabel('[m]'); grid on;
legend(lbl,"Location","best");
addJitterLines(didJitter1,timeLine);

% -- Velocity
nexttile;
plot(timeLine, vel1); title('Velocity'); ylabel('[m/s]'); grid on;
legend(lbl,"Location","best");
addJitterLines(didJitter1,timeLine);

% -- Force
nexttile;
plot(timeLine, force1); title('Aerodynamic + gravity force'); ylabel('[N]'); grid on;
legend(lbl,"Location","best");
addJitterLines(didJitter1,timeLine);

% -- Angular velocity
nexttile;
plot(timeLine, ang1); title('Angular velocity'); ylabel('[rad/s]'); grid on;
legend(lbl,"Location","best");
addJitterLines(didJitter1,timeLine);

% -- Moment
nexttile;
plot(timeLine, mom1); title('Aerodynamic moment'); ylabel('[N·m]'); grid on;
legend(lbl,"Location","best");
addJitterLines(didJitter1,timeLine);

%% ------- helper to add faint jitter guides ---------------------------
function addJitterLines(didJitter1,timeLine)
    if any(didJitter1)
        yL = ylim;
        xline(timeLine(didJitter1), 'k:', 'Alpha',0.2, 'LineWidth',1,'HandleVisibility','off');
        ylim(yL);
    end
end


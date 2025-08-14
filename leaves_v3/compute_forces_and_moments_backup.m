function FM = compute_forces_and_moments(leaf)
% Angle–dependent moment arm with destabilising sign.
% a0 tunes the peak lever arm as a fraction of R.

% --- constants ---------------------------------------------------------
rho_air   = 1.2;              % kg m^-3
Cd_perp   = 1.0;              % face-on
Cd_parallel = 0.05;           % edge-on
g         = 9.81;             % m s^-2
a0        = 0.25;             % peak lever-arm fraction (tweakable)

% --- relative flow -----------------------------------------------------
v_leaf = [leaf.vx; leaf.vy; leaf.vz];
v_air = [0; 0; 0]; % still air
v_rel = v_leaf - v_air;
speed = norm(v_rel);
if speed > 1e-12
    v_hat = v_rel / speed;
else
    % Flow direction undefined when speed ~ 0; pick any unit vector.
    % Setting v_hat = [0;0;0] is fine because speed^2 factor → 0 drag anyway.
    v_hat = [0; 0; 0];
end

% --- surface normal ----------------------------------------------------
q      = [leaf.q1, leaf.q2, leaf.q3, leaf.q4];
n      = quat_rotate([0;0;1], q);             % unit normal

% --- drag force --------------------------------------------------------
A       = pi*leaf.R^2;
cosTh   = dot(n, v_hat);
Cd      = Cd_parallel + (Cd_perp - Cd_parallel)*abs(cosTh)^2;
F_drag  = 0.5*rho_air*A*Cd*speed^2 * (-v_hat);

% --- gravity -----------------------------------------------------------
F_grav  = [0; -leaf.mass*g; 0];
F_total = F_drag + F_grav;

% --- destabilising moment (eq.-1) --------------------------------------
sinTh   = norm(cross(n, v_hat));              % |n×v̂|  (already >=0)
a_theta = a0 * 2 * sinTh * abs(cosTh);        % eq.-(1)
r_eff   =  a_theta * leaf.R * n;              % along +n  → destabilising
M_drag  = cross(r_eff, F_drag);

FM      = [F_total; M_drag];
end

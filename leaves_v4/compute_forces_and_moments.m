function FM = compute_forces_and_moments(leaf,v_air)
% --- constants ---------------------------------------------------------
rho_air   = 1.2;
Cd_perp   = 2.0; % 1.0
Cd_par    = 0.3; % 0.05
g         = 9.81;
aCoP      = 0.25;    % CoP shift as fraction of R

% --- relative flow -----------------------------------------------------
v_leaf = [leaf.vx leaf.vy leaf.vz];
% v_air = [0; 0; 0];
v_rel  = v_leaf - v_air;                    % still air world  (air vel = 0)
V      = norm(v_rel);
if V < 1e-12
    v_hat = [0 0 0];
else
    v_hat = v_rel / V;
end

% --- local frame -------------------------------------------------------
q = [leaf.q1 leaf.q2 leaf.q3 leaf.q4];
n = quat_rotate([0 0 1], q);        % world normal

% angle between flow & normal
cosTh = dot(n, v_hat);
Cd    = Cd_par + (Cd_perp - Cd_par)*cosTh^2;

% --- drag force (vector) ----------------------------------------------
A      = pi*leaf.R^2;
F_drag = -0.5*rho_air*A*Cd*V^2 * v_hat;   % 3-D, opposite flow

% --- normal (lift/pressure) force  *new* --------------------------------
Cn_max  = 0.5; % 1.1                          % tune 0.8–1.3 for species
sinTh   = norm(cross(n, v_hat));        % 0…1 always ≥0
Cn      =  Cn_max * sin(2*atan2(sinTh,cosTh));   % = Cn_max*sin 2θ
F_norm  = -0.5*rho_air*A*Cn*V^2 * sign(cosTh) * n;

% --- total aerodynamic force -------------------------------------------
F_aero  = F_drag + F_norm;

% --- centre-of-pressure shift -----------------------------------------
v_parallel_local = quat_rotate(v_hat, quat_conj(q));   % project into leaf frame
v_parallel_local(3) = 0;                               % drop normal component
if norm(v_parallel_local) > 1e-8
    v_parallel_local = v_parallel_local / norm(v_parallel_local);
else
    v_parallel_local = [0 0 0];
end
r_CoP_local  = -aCoP * leaf.R * v_parallel_local;      % upstream shift
r_CoP_world  = quat_rotate(r_CoP_local, q); % local to world coords

% --- moments -----------------------------------------------------------
M_aero = cross(r_CoP_world, F_aero);

% --- gravity -----------------------------------------------------------
F_grav = [0 -leaf.mass*g 0];

% --- assemble ----------------------------------------------------------
F_total = F_grav + F_aero;
FM      = [F_total M_aero];
end

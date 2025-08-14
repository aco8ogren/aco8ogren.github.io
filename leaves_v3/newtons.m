function leaf = newtons(leaf, FM, dt)
% NEWTONS  Advance one time-step using symplectic Euler
%
%   leaf = NEWTONS(leaf, FM, dt)
%
% Inputs
%   leaf  –  Leaf object (state at t_k)
%   FM    –  6x1 vector [Fx Fy Fz Mx My Mz]  (world frame)
%   dt    –  step size [s]  (default 0.016 ≈ 60 FPS)
%
% Output
%   leaf  –  updated object (state at t_{k+1})

% ----------------------------------------------------------------------
F = FM(1:3);   M = FM(4:6);

%% ---------- Linear dynamics (symplectic Euler) -----------------------
accel     = F / leaf.mass;               % a = F / m
leaf.vx   = leaf.vx + accel(1)*dt;
leaf.vy   = leaf.vy + accel(2)*dt;
leaf.vz   = leaf.vz + accel(3)*dt;

leaf.x    = leaf.x + leaf.vx*dt;         % use v_{k+1}
leaf.y    = leaf.y + leaf.vy*dt;         % use v_{k+1}
leaf.z    = leaf.z + leaf.vz*dt;         % use v_{k+1}

%% ---------- Rotational dynamics --------------------------------------
alpha         = (M / leaf.momentOfInertia);   % alpha = I^{-1} M
leaf.omega    = leaf.omega + alpha*dt;         % omega_{k+1}

omega_mag     = norm(leaf.omega);
if omega_mag > 1e-8
    axis        = leaf.omega / omega_mag;      % unit rotation axis
    dq          = axisangle_to_quat(axis, omega_mag*dt); % delta-quat
    q_old       = [leaf.q1, leaf.q2, leaf.q3, leaf.q4];
    q_new       = quat_mult(dq, q_old);        % q_{k+1} = dq ⊗ q_k
    q_new       = q_new / norm(q_new);         % renormalise

    % Check that quaternions are real
    if ~isreal(q_new)
        error('Quaternion became complex at step – check force or torque blow-ups');
    end

    leaf.q1 = q_new(1);
    leaf.q2 = q_new(2);
    leaf.q3 = q_new(3);
    leaf.q4 = q_new(4);
    % [leaf.q1, leaf.q2, leaf.q3, leaf.q4] = deal( ...
    %     q_new(1), q_new(2), q_new(3), q_new(4));
end

%% ---------- Diagnostic normal ----------------------------------------
leaf.normal = quat_rotate([0 0 1], [leaf.q1, leaf.q2, leaf.q3, leaf.q4]).';

end

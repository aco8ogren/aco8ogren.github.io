function leaf = newtons(leaf, F, M, dt)
    % NEWTONS  Advance one time-step using symplectic Euler
    %
    %   leaf = NEWTONS(leaf, F, M, dt)
    %
    % Inputs
    %   leaf  –  Leaf object (state at t_k)
    %   FM    –  3x1 vector [Fx Fy Fz]  (world frame)
    %   M     –  3x1 vector [Mx My Mz] (world frame)
    %   dt    –  step size [s]
    %
    % Output
    %   leaf  –  updated object (state at t_{k+1})

    %% Linear dynamics (symplectic Euler)
    accel = F / leaf.mass;
    leaf.v = leaf.v + accel*dt;
    leaf.x = leaf.x + leaf.v*dt;

    %% Rotational dynamics
    alpha = (M / leaf.momentOfInertia);
    leaf.omega = leaf.omega + alpha*dt; % omega_{k+1}

    omega_mag = norm(leaf.omega);
    if omega_mag > 1e-8
        rot_ax = leaf.omega / omega_mag; % unit rotation axis
        dq = axisangle_to_quat(rot_ax, omega_mag*dt); % delta-quat
        q_old = leaf.q;
        q_new = quat_mult(dq, q_old); % q_{k+1} = dq ⊗ q_k
        q_new = q_new / norm(q_new); % re-normalize

        % Check that quaternions are real
        if ~isreal(q_new)
            error('Quaternion became complex at step – check force or torque blow-ups');
        end

        leaf.q = q_new;
    end

    %% Update normal to agree with new quaternion
    leaf.normal = quat_rotate([0 0 1], leaf.q).';
    
end

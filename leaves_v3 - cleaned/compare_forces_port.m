clear; clc;

R_leaf = 0.75;
rho_leaf = 2.0;
g = 9.81;

leaf = Leaf();
leaf.q = axisangle_to_quat([0 1 0], pi/4);
leaf.normal = quat_rotate([0 0 1], leaf.q);

leaf.x = [0, 0, 0];
leaf.v = [1.0, 2.0, 0.0];

leaf.R = R_leaf;
leaf.rho = rho_leaf;
leaf.mass = pi * R_leaf^2 * rho_leaf;
leaf.momentOfInertia = 0.5 * leaf.mass * R_leaf^2;
leaf.Cd_perpendicular = 2.0;
leaf.Cd_parallel = 0.3;
leaf.Cn_max = 0.5;
leaf.aCoP = 0.25;

v_air = [0.5, 0.0, 0.0];
rho_air = 1.2;

[F, M] = compute_forces_and_moments(leaf, v_air, rho_air, verbosity);

disp('--- Final MATLAB total force/moment check ---');
fprintf('F (N)    = [%0.12f, %0.12f, %0.12f]\n', F);
fprintf('M (N·m)  = [%0.12f, %0.12f, %0.12f]\n', M);

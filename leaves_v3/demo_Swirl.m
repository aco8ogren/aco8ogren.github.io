% DEMO_SWIRL  –  Example of creating a Swirl object and visualising the
%                velocity field with a quiver3 plot.
% ----------------------------------------------------------------------

clear; clc; close all;

% -------- Swirl parameters --------------------------------------------
centre = [5 5 0];        % vortex centre [m]
axis   = [0 0 1];        % swirl axis (upwards)
R      = 1.5;            % radius where |v| ≈ U0
U0     = 1.0;            % peak tangential speed [m/s]

S = Swirl(centre, axis, R, U0);   % create the swirl object

% -------- Evaluation grid ---------------------------------------------
Nx = 20; Ny = 20; Nz = 1;
[xg,yg,zg] = meshgrid(linspace(0,10,Nx), ...
                      linspace(0,10,Ny), ...
                      linspace(-2, 2,Nz));    % thin slab about z = 0

v_air = eval_swirl_at_point(S, xg, yg, zg, 0);   % 3×N matrix
u = reshape(v_air(1,:), size(xg));
v = reshape(v_air(2,:), size(xg));
w = reshape(v_air(3,:), size(xg));

% -------- Quiver3 plot -------------------------------------------------
figure('Color','w','WindowState','maximized');
quiver3(xg, yg, zg, u, v, w, 'Color',[0.1 0.3 0.9], 'AutoScale','on');
axis equal tight; grid on;
xlabel('x [m]'); ylabel('y [m]'); zlabel('z [m]');
title(sprintf('Localised Gaussian swirl – centre=[%.1f %.1f %.1f], R=%.1f m', ...
              centre, R));
view(35,25);

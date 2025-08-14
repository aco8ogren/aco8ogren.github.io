% DEMO_ONE_SWIRL3D  –  preview of a single Gaussian swirl field
% -------------------------------------------------------------

clear; clc; close all;

% user-tunable parameters
centre  = [5 5 0];
n_axis  = [0 0 1];
R       = 1.5;      % [m]
U0      = 1.0;      % [m/s]

% plotting grid
Nx = 20; Ny = 20; Nz = 8;
[x,y,z] = meshgrid(linspace(0,10,Nx), ...
                   linspace(0,10,Ny), ...
                   linspace(-2,2,Nz));

v_air = one_swirl(x,y,z, centre, n_axis, R, U0);   % 3×(Nx*Ny*Nz)
u = reshape(v_air(1,:), size(x));
v = reshape(v_air(2,:), size(x));
w = reshape(v_air(3,:), size(x));

figure('Color','w','WindowState','maximized');
quiver3(x,y,z,u,v,w,'Color',[0.1 0.3 0.9],'AutoScale','on');
axis equal tight; grid on;
xlabel('x [m]'); ylabel('y [m]'); zlabel('z [m]');
title(sprintf('One swirl  –  centre=[%.1f %.1f %.1f],  R=%.1f m', centre, R));
view(35,25);

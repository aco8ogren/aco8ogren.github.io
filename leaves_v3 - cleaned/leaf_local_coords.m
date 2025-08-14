function [x_spade, y_spade] = leaf_local_coords(size)
% leaf_local_coords Generates a spade-shaped leaf outline in local coordinates
%   [x, y] = leaf_local_coords(size) returns the x and y boundary coordinates
%   of a spade-shaped leaf scaled by the input size.

    % Top lobe (heart-like bulb) using polar coordinates
    theta = linspace(-pi/6, pi + pi/6, 8);
    heart_radius = 1;
    x_top = heart_radius * cos(theta);
    y_top = heart_radius * sin(theta);

    % Bottom stem of the spade (rectangle)
    stem_x = [-0.2, -0.2, 0.2, 0.2];
    stem_y = [-0.2, -0.8, -0.8, -0.2];

    % Combine the top lobe and stem
    x_spade = [x_top, stem_x];
    y_spade = [y_top, stem_y];

    % Apply size scaling
    x_spade = size * x_spade;
    y_spade = size * y_spade;
end
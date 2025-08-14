function [axis, angle] = surfacenormal_to_axisangle(n_desired)
% SURFACENORMAL_TO_AXISANGLE Computes axis-angle rotation from [0 0 1] to n_desired
% Input:
%   n_desired - target surface normal vector (should be unit length)
% Outputs:
%   axis - 3x1 unit vector representing rotation axis
%   angle - scalar angle in radians

n0 = [0; 0; 1];
axis = cross(n0, n_desired(:));
axis_norm = norm(axis);

if axis_norm < 1e-8
    axis = [1; 0; 0]; % arbitrary axis if aligned
    angle = 0;
else
    axis = axis / axis_norm;
    angle = acos(dot(n0, n_desired(:)));
end
end

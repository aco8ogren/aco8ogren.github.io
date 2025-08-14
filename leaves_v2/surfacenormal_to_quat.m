function q = surfacenormal_to_quat(n_desired)
% SURFACENORMAL_TO_QUAT Returns a quaternion [w x y z] that rotates [0 0 1] to n_desired
% Input:
%   n_desired - target normal direction (unit vector)
% Output:
%   q - 1x4 quaternion [w x y z]

if ~any(n_desired)
    error('surface normal ''n_desired'' cannot be all zeros')
end

n_desired = n_desired/norm(n_desired);
[axis, angle] = surfacenormal_to_axisangle(n_desired);
q = axisangle_to_quat(axis, angle);
end

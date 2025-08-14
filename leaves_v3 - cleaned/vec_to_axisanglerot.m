function [axis, angle] = vec_to_axisanglerot(v)
    % VEC_TO_AXISANGLEROT computes axis-angle rotation from [0 0 1] to v
    % Input:
    %   v - target vector (orientation)
    % Outputs:
    %   axis - 3x1 unit vector representing rotation axis
    %   angle - scalar angle in radians

    if ~any(v)
        error('vector ''v'' cannot be all zeros')
    end

    % normalize v
    v = v/norm(v);

    % get the axis that we can rotate about
    z = [0; 0; 1];
    axis = cross(z, v(:));
    axis_norm = norm(axis);

    if axis_norm < 1e-8
        axis = [1; 0; 0]; % arbitrary axis if aligned
        angle = 0;
    else
        axis = axis / axis_norm;
        angle = acos(dot(z, v(:)));
    end
end

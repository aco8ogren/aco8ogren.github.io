function q = vec_to_quat(v)
    % VEC_TO_QUAT returns a quaternion [w x y z] that rotates [0 0 1] to v
    % Input:
    %   v - target vector (orientation)
    % Output:
    %   q - 1x4 quaternion [w x y z]

    if ~any(v)
        error('vector ''v'' cannot be all zeros')
    end

    % normalize v
    v = v/norm(v);

    % get the axis-angle rotation from [0 0 1] to v
    [axis, angle] = vec_to_axisanglerot(v);

    % get the quaternions that represent the axis-angle rotation from [0 0 1] to v
    q = axisangle_to_quat(axis, angle);
end

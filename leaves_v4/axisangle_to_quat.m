function q = axisangle_to_quat(axis, angle)
    s = sin(angle/2);
    q = [cos(angle/2), axis(1)*s, axis(2)*s, axis(3)*s];
end

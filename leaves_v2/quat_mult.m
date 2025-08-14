function q_out = quat_mult(q1, q2)
% QUAT_MULT Multiply two quaternions q1 and q2
    w1 = q1(1); v1 = q1(2:4);
    w2 = q2(1); v2 = q2(2:4);
    q_out = [w1*w2 - dot(v1,v2), w1*v2 + w2*v1 + cross(v1,v2)];
end
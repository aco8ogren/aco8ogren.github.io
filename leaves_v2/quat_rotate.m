function v_rot = quat_rotate(v, q)
% QUAT_ROTATE  Rotate a 3-vector by quaternion q  (NO implicit reshaping)
%
%   v_rot = quat_rotate(v, q)
%
% Required shapes (principled coding contract)
%   v : 3x1  column vector   (world-space vector to be rotated)
%   q : 1x4  row    vector   [w x y z]   (unit not required; will normalise)
%
% Returns
%   v_rot : 3x1  column vector (same orientation as the accepted contract)
%
% Any deviation from these shapes triggers an error.

% ---------- shape guards ------------------------------------------------
if ~isequal(size(v), [3 1])
    error('quat_rotate:BadVectorShape', ...
        'Input v must be 3x1 column; got size(v) = [%d %d].', size(v));
end
if ~isequal(size(q), [1 4])
    error('quat_rotate:BadQuatShape', ...
        'Quaternion q must be 1x4 row [w x y z]; got size(q) = [%d %d].', ...
        size(q));
end

% ---------- normalise quaternion ---------------------------------------
q = q / norm(q);                       % safe even if already unit

% ---------- rotation formula (Rodrigues via quaternion algebra) --------
q_vec = q(2:4).';                      % 3x1 vector part
t     = 2 * cross(q_vec, v);           
v_rot = v + q(1)*t + cross(q_vec, t);  % rotated vector
end
